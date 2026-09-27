//! Nó da rede: endpoint iroh (QUIC criptografado; identidade = chave), descoberta na rede local (mDNS),
//! pareamento por código e chat remoto. Cada conversa entre dois apps abre uma conexão com um stream
//! bidirecional; a primeira mensagem diz o que se quer (Hello / PairRequest / ChatRequest).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use iroh::endpoint::{presets, Connection};
use iroh::protocol::{AcceptError, ProtocolHandler, Router};
use iroh::{Endpoint, EndpointAddr, PublicKey, SecretKey};
use serde::Serialize;
use tokio::io::BufReader;

use super::identity::{DeviceInfo, DeviceKind};
use super::pairing::{PairCheck, PairCode, Permissions, TrustStore, TrustedDevice};
use super::netlog::NetLog;
use super::protocol::{read_message, write_message, Message, ALPN};
use super::update::{self, InstallerFile, UpdateDecision};

/// Pedido de chat que chegou de outro computador.
pub struct ChatRequestData {
    pub request_id: String,
    pub model: String,
    pub messages: serde_json::Value,
    pub think: Option<bool>,
    pub think_level: Option<String>,
    pub options: Option<serde_json::Value>,
    /// Ligado quando quem pediu desistiu (a conexão caiu): o executor para de gerar.
    pub cancel: Arc<AtomicBool>,
    /// Nome do computador que perguntou (para a tela deste mostrar quem está usando a IA).
    pub from_name: String,
}

/// Quem responde os pedidos de chat (no app: `run_chat_with` com o Ollama local). Recebe os pedaços por callback.
pub type ChatExecutor = Arc<dyn Fn(ChatRequestData, &mut dyn FnMut(serde_json::Value)) -> Result<serde_json::Value, String> + Send + Sync>;

/// Tarefa de agente que chegou de outro computador.
pub struct AgentTaskData {
    pub request_id: String,
    pub task: String,
    pub from_id: String,
    pub from_name: String,
    /// A permissão "Controlar este PC" está desligada: quem está aqui precisa aprovar.
    pub needs_confirm: bool,
}

/// Quem executa as tarefas de agente (no app: a tela deste PC confirma e roda o agente local).
pub type AgentExecutor = Arc<dyn Fn(AgentTaskData) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send>> + Send + Sync>;

/// Oferta de atualização que chegou de outro computador (a tela deste PC decide).
pub struct UpdateOfferData {
    pub from_id: String,
    pub from_name: String,
    pub version: String,
    pub file_name: String,
    pub size: u64,
}

/// Pergunta na tela deste PC se instala a atualização oferecida.
pub type UpdateAsker = Arc<dyn Fn(UpdateOfferData) -> std::pin::Pin<Box<dyn std::future::Future<Output = UpdateDecision> + Send>> + Send + Sync>;
/// Roda o instalador já conferido (no app: instalação silenciosa do NSIS e reabre o app).
pub type UpdateInstaller = Arc<dyn Fn(PathBuf) -> Result<(), String> + Send + Sync>;

/// Computador visto recentemente (respondeu um Hello ou nos mandou um).
#[derive(Clone)]
struct Seen {
    info: DeviceInfo,
    addr: Option<EndpointAddr>,
    last: Instant,
}

/// Visto há menos que isso = online.
const ONLINE_WINDOW: Duration = Duration::from_secs(35);

pub struct NodeConfig {
    pub dir: PathBuf,
    pub key: SecretKey,
    pub info: DeviceInfo,
    pub mdns: bool,
    /// Pela internet (opcional, desligado por padrão): usa os servidores públicos do iroh (n0) para achar e
    /// retransmitir. O conteúdo continua criptografado de ponta a ponta; o servidor só vê o endereço.
    pub internet: bool,
    pub executor: ChatExecutor,
    pub agent: AgentExecutor,
    pub update_asker: UpdateAsker,
    pub update_installer: UpdateInstaller,
    pub on_change: Arc<dyn Fn() + Send + Sync>,
    /// Hello para os pareados ao abrir e a cada 10 s (independe do mDNS). Desligado nos testes, que chamam na mão.
    pub reconnect_loop: bool,
}

/// `rede\porta.json`: a porta UDP deste computador (só o número). Fixa entre aberturas para o endereço salvo pelos
/// outros continuar valendo.
pub const PORT_FILE: &str = "porta.json";

pub fn load_port(dir: &std::path::Path) -> Option<u16> {
    std::fs::read_to_string(dir.join(PORT_FILE)).ok()?.trim().parse().ok().filter(|port| *port > 0)
}

fn save_port(dir: &std::path::Path, port: u16) {
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join(PORT_FILE), port.to_string());
}

/// Abre o endpoint na porta pedida (IPv4 obrigatória, IPv6 se der) ou numa porta livre (`None`).
async fn bind_endpoint(key: &SecretKey, internet: bool, port: Option<u16>) -> Result<Endpoint, String> {
    let builder = if internet { Endpoint::builder(presets::N0) } else { Endpoint::builder(presets::Minimal) };
    let builder = builder.secret_key(key.clone()).alpns(vec![ALPN.to_vec()]);
    let builder = match port {
        Some(port) => builder
            .clear_ip_transports()
            .bind_addr(std::net::SocketAddr::from(([0, 0, 0, 0], port)))
            .map_err(io)?
            .bind_addr_with_opts(std::net::SocketAddr::from((std::net::Ipv6Addr::UNSPECIFIED, port)), iroh::endpoint::BindOpts::default().set_is_required(false))
            .map_err(io)?,
        None => builder,
    };
    builder.bind().await.map_err(io)
}

/// Erro de conexão do iroh → português com dica (mesma ideia do `dica_conexao` do app do Mac), com o original entre parênteses.
pub fn dica_conexao(erro: &str, internet: bool, nome: Option<&str>) -> String {
    let quem = nome.unwrap_or("o outro computador");
    if erro.contains("No addressing information") {
        let passo = if internet { "Confira se \"Internet\" está ligada também nele (ou coloque os dois na mesma rede)" } else { "Ligue \"Internet\" nos dois computadores (ou coloque os dois na mesma rede)" };
        return format!("Este PC não sabe onde {quem} está. {passo} e tente Reconectar. ({erro})");
    }
    if erro == SEM_RESPOSTA || erro.to_lowercase().contains("timed out") || erro.contains("timeout") {
        return "O outro computador não respondeu: o Open Assistant está aberto nele? O firewall libera o app?".into();
    }
    let dica = if internet { "" } else { " Se ele estiver em outra rede, ligue \"Internet\" nos dois." };
    format!("Não foi possível conectar a {quem}.{dica} ({erro})")
}

/// Marcador de prazo estourado (vira a mensagem de "não respondeu").
pub const SEM_RESPOSTA: &str = "timeout";

struct Inner {
    key: SecretKey,
    dir: PathBuf,
    log: NetLog,
    port: u16,
    fixed_port: bool,
    /// Desligado no `shutdown`: os laços em segundo plano deste nó param.
    alive: AtomicBool,
    /// Último estado conhecido de cada pareado (para logar só quando muda).
    reachable: Mutex<HashMap<String, bool>>,
    endpoint: Endpoint,
    router: Mutex<Option<Router>>,
    info: Mutex<DeviceInfo>,
    trust: Mutex<TrustStore>,
    code: Mutex<Option<PairCode>>,
    seen: Mutex<HashMap<String, Seen>>,
    /// Achados pela descoberta da rede local (o resto chegou pela internet).
    lan: Mutex<HashSet<String>>,
    executor: ChatExecutor,
    agent: AgentExecutor,
    update_asker: UpdateAsker,
    update_installer: UpdateInstaller,
    on_change: Arc<dyn Fn() + Send + Sync>,
    visible: AtomicBool,
    internet: bool,
}

/// Linha da página Rede (mesmos campos que `NetDevice` no front).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NetDeviceView {
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    pub os: String,
    pub mac: Option<String>,
    pub gpu: Option<String>,
    pub models: Vec<String>,
    pub online: bool,
    pub paired: bool,
    #[serde(rename = "self")]
    pub is_self: bool,
    pub link: Option<String>,
    pub permissions: Option<Permissions>,
    /// Última vez que respondeu (histórico dos computadores já conectados).
    pub last_seen: Option<u64>,
    /// Endereços salvos no histórico (`ip:porta` ou `relay:<url>`).
    pub addrs: Vec<String>,
}

fn addr_label(addr: &iroh::TransportAddr) -> String {
    match addr {
        iroh::TransportAddr::Ip(ip) => ip.to_string(),
        iroh::TransportAddr::Relay(url) => format!("relay:{url}"),
        other => format!("{other:?}"),
    }
}

#[derive(Clone)]
pub struct Node {
    inner: Arc<Inner>,
}

impl std::fmt::Debug for Node {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Node").field("id", &self.id()).finish()
    }
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn io<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

impl Node {
    pub async fn start(config: NodeConfig) -> Result<Node, String> {
        // `Minimal`: nada é publicado na internet; só a rede local (mDNS) e endereços diretos.
        // Porta fixa (`rede\porta.json`): se estiver ocupada, abre em outra e grava a nova.
        let log = NetLog::new(&config.dir);
        let saved = load_port(&config.dir);
        let (endpoint, fixed_port) = match saved {
            Some(port) => {
                // Ao reiniciar o nó (ex.: ligar Internet), a porta antiga leva um instante para ser liberada.
                let mut bound = bind_endpoint(&config.key, config.internet, Some(port)).await;
                for _ in 0..16 {
                    if bound.is_ok() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    bound = bind_endpoint(&config.key, config.internet, Some(port)).await;
                }
                match bound {
                    Ok(endpoint) => (endpoint, true),
                    Err(error) => {
                        log.warn("porta_ocupada", serde_json::json!({ "porta": port, "erro": error }));
                        (bind_endpoint(&config.key, config.internet, None).await?, false)
                    }
                }
            }
            None => (bind_endpoint(&config.key, config.internet, None).await?, false),
        };
        let port = endpoint.bound_sockets().iter().find(|addr| addr.is_ipv4()).or(endpoint.bound_sockets().first()).map(|addr| addr.port()).unwrap_or(0);
        if port != 0 && saved != Some(port) {
            save_port(&config.dir, port);
        }
        let mut info = config.info;
        info.id = endpoint.id().to_string();
        let node = Node {
            inner: Arc::new(Inner {
                key: config.key.clone(),
                dir: config.dir.clone(),
                log,
                port,
                fixed_port,
                alive: AtomicBool::new(true),
                reachable: Mutex::new(HashMap::new()),
                endpoint: endpoint.clone(),
                router: Mutex::new(None),
                info: Mutex::new(info),
                trust: Mutex::new(TrustStore::load(&config.dir.join("confiaveis.json"))),
                code: Mutex::new(None),
                seen: Mutex::new(HashMap::new()),
                lan: Mutex::new(HashSet::new()),
                executor: config.executor,
                agent: config.agent,
                update_asker: config.update_asker,
                update_installer: config.update_installer,
                on_change: config.on_change,
                visible: AtomicBool::new(true),
                internet: config.internet,
            }),
        };
        let router = Router::builder(endpoint.clone()).accept(ALPN, Handler { node: node.clone() }).spawn();
        *node.inner.router.lock().unwrap() = Some(router);
        let mdns = config.mdns && match node.start_mdns() {
            Ok(()) => true,
            Err(error) => {
                node.inner.log.warn("mdns_falhou", serde_json::json!({ "erro": error }));
                false
            }
        };
        let paired = node.inner.trust.lock().unwrap().devices.len();
        node.inner.log.info("rede_iniciada", serde_json::json!({ "id": node.id(), "porta": port, "portaFixa": fixed_port, "internet": config.internet, "mdns": mdns, "pareados": paired }));
        if config.reconnect_loop {
            node.start_reconnect_loop();
        }
        Ok(node)
    }

    /// Ao abrir (na hora) e a cada 10 s: Hello para quem já conhecemos (online/offline, modelos e endereços).
    /// Roda com ou sem mDNS.
    fn start_reconnect_loop(&self) {
        // Referência fraca: o laço não segura o nó (e a porta) depois do `shutdown`.
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            loop {
                let Some(inner) = weak.upgrade() else { break };
                let node = Node { inner };
                if !node.inner.alive.load(Ordering::SeqCst) {
                    break;
                }
                node.reconnect_sweep().await;
                (node.inner.on_change)();
                drop(node);
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });
    }

    /// Uma rodada de Hello (prazo de 8 s cada). Para os pareados, anota no log quando o estado muda.
    pub async fn reconnect_sweep(&self) {
        let paired: HashSet<String> = self.inner.trust.lock().unwrap().devices.iter().map(|device| device.info.id.clone()).collect();
        let mut jobs = tokio::task::JoinSet::new();
        for addr in self.known_addrs() {
            let node = self.clone();
            let is_paired = paired.contains(&addr.id.to_string());
            jobs.spawn(async move {
                let id = addr.id.to_string();
                let tried = addr.addrs.iter().map(addr_label).collect::<Vec<_>>();
                let outcome = match tokio::time::timeout(Duration::from_secs(8), node.hello(addr)).await {
                    Ok(result) => result.map(|_| ()),
                    Err(_) => Err(SEM_RESPOSTA.to_string()),
                };
                if is_paired {
                    node.note_reachability(&id, outcome.as_ref().err().map(String::as_str), &tried, false);
                }
            });
        }
        while jobs.join_next().await.is_some() {}
    }

    /// Log de mudança de estado de um pareado: `pareado_online` ao voltar; `pareado_sem_resposta` quando cai
    /// (ou sempre, se foi o botão Reconectar).
    fn note_reachability(&self, id: &str, error: Option<&str>, tried: &[String], manual: bool) {
        let name = self.inner.trust.lock().unwrap().get(id).map(|device| device.info.name.clone()).unwrap_or_default();
        let previous = self.inner.reachable.lock().unwrap().insert(id.to_string(), error.is_none());
        match error {
            None if previous != Some(true) => self.inner.log.info("pareado_online", serde_json::json!({ "id": id, "nome": name })),
            Some(error) if previous != Some(false) || manual => {
                let dica = dica_conexao(error, self.inner.internet, Some(&name));
                self.inner.log.warn("pareado_sem_resposta", serde_json::json!({ "id": id, "nome": name, "erro": error, "enderecosTentados": tried, "internet": self.inner.internet, "dica": dica }));
            }
            _ => {}
        }
    }

    pub fn log(&self) -> &NetLog {
        &self.inner.log
    }

    pub fn dir(&self) -> PathBuf {
        self.inner.dir.clone()
    }

    pub fn port(&self) -> u16 {
        self.inner.port
    }

    /// Estado para diagnóstico (`estado.json`, MCP `rede_diagnostico`).
    pub fn diagnostics(&self) -> serde_json::Value {
        serde_json::json!({
            "este": self.info(),
            "porta": self.inner.port,
            "portaFixa": self.inner.fixed_port,
            "internet": self.inner.internet,
            "visivel": self.visible(),
            "dispositivos": self.devices().into_iter().filter(|device| !device.is_self).collect::<Vec<_>>(),
            "problemasRecentes": self.inner.log.recent_problems(),
        })
    }

    fn start_mdns(&self) -> Result<(), String> {
        use iroh_mdns_address_lookup::{DiscoveryEvent, MdnsAddressLookup};
        use n0_future::StreamExt;
        let mdns = MdnsAddressLookup::builder().service_name("open-assistant").build(self.inner.endpoint.id()).map_err(io)?;
        self.inner.endpoint.address_lookup().map_err(io)?.add(mdns.clone());
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            let mut events = mdns.subscribe().await;
            while let Some(event) = events.next().await {
                let Some(inner) = weak.upgrade() else { break };
                let node = Node { inner };
                if !node.inner.alive.load(Ordering::SeqCst) {
                    break;
                }
                if let DiscoveryEvent::Discovered { endpoint_info, .. } = event {
                    let addr = endpoint_info.to_endpoint_addr();
                    node.inner.lan.lock().unwrap().insert(addr.id.to_string());
                    tokio::spawn(async move {
                        let _ = node.hello(addr).await;
                    });
                }
            }
        });
        Ok(())
    }

    #[cfg(test)]
    pub async fn start_for_test(name: &str, executor: impl Fn(ChatRequestData, &mut dyn FnMut(serde_json::Value)) -> Result<serde_json::Value, String> + Send + Sync + 'static) -> Result<Node, String> {
        Node::start_for_test_with(name, executor, UpdateDecision::Later, Arc::new(|_| Ok(()))).await
    }

    #[cfg(test)]
    pub async fn start_for_test_with(
        name: &str,
        executor: impl Fn(ChatRequestData, &mut dyn FnMut(serde_json::Value)) -> Result<serde_json::Value, String> + Send + Sync + 'static,
        decision: UpdateDecision,
        update_installer: UpdateInstaller,
    ) -> Result<Node, String> {
        let dir = std::env::temp_dir().join(format!("oa-node-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let info = DeviceInfo { id: String::new(), name: name.into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: None, models: vec!["qwen3.5:9b".into()] };
        let agent: AgentExecutor = Arc::new(|task: AgentTaskData| Box::pin(async move { if task.needs_confirm { Err("Recusado neste computador.".to_string()) } else { Ok(format!("feito: {}", task.task)) } }));
        let update_asker: UpdateAsker = Arc::new(move |_offer| Box::pin(async move { decision }));
        Node::start(NodeConfig { dir, key: SecretKey::generate(), info, mdns: false, internet: false, executor: Arc::new(executor), agent, update_asker, update_installer, on_change: Arc::new(|| {}), reconnect_loop: false }).await
    }

    /// Nó de teste numa pasta e chave escolhidas (simula fechar e abrir o mesmo app).
    #[cfg(test)]
    pub async fn start_for_test_at(name: &str, dir: PathBuf, key: SecretKey, internet: bool) -> Result<Node, String> {
        let info = DeviceInfo { id: String::new(), name: name.into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: None, models: vec![] };
        let agent: AgentExecutor = Arc::new(|task: AgentTaskData| Box::pin(async move { Ok(format!("feito: {}", task.task)) }));
        let update_asker: UpdateAsker = Arc::new(|_offer| Box::pin(async move { UpdateDecision::Later }));
        Node::start(NodeConfig { dir, key, info, mdns: false, internet, executor: Arc::new(|_, _| Err("sem chat".to_string())), agent, update_asker, update_installer: Arc::new(|_| Ok(())), on_change: Arc::new(|| {}), reconnect_loop: false }).await
    }

    pub fn id(&self) -> String {
        self.inner.endpoint.id().to_string()
    }

    pub fn addr(&self) -> EndpointAddr {
        self.inner.endpoint.addr()
    }

    pub fn info(&self) -> DeviceInfo {
        self.inner.info.lock().unwrap().clone()
    }

    pub fn set_models(&self, models: Vec<String>) {
        self.inner.info.lock().unwrap().models = models;
    }

    pub fn set_visible(&self, visible: bool) {
        self.inner.visible.store(visible, Ordering::SeqCst);
    }

    pub fn internet(&self) -> bool {
        self.inner.internet
    }

    pub fn visible(&self) -> bool {
        self.inner.visible.load(Ordering::SeqCst)
    }

    /// Código que a tela Remoto mostra o tempo todo: o mesmo enquanto valer; outro quando expira, é usado ou trava.
    pub fn current_code(&self) -> (String, u64) {
        let now = Instant::now();
        let mut current = self.inner.code.lock().unwrap();
        if !current.as_ref().is_some_and(|code| code.usable(now)) {
            *current = Some(PairCode::new(now));
        }
        let code = current.as_ref().unwrap();
        (code.code().to_string(), code.expires_in(now).as_secs())
    }

    /// Reconecta a um computador do histórico (usa os últimos endereços salvos). Prazo de 12 s; erro em português.
    pub async fn reconnect(&self, id: &str) -> Result<DeviceInfo, String> {
        let addr = self.addr_of(id)?;
        let tried = addr.addrs.iter().map(addr_label).collect::<Vec<_>>();
        let outcome = match tokio::time::timeout(Duration::from_secs(12), self.hello(addr)).await {
            Ok(result) => result,
            Err(_) => Err(SEM_RESPOSTA.to_string()),
        };
        self.note_reachability(id, outcome.as_ref().err().map(String::as_str), &tried, true);
        outcome.map_err(|error| if error == SEM_RESPOSTA { dica_conexao(&error, self.inner.internet, None) } else { error })
    }

    /// Reconecta todos os pareados ao mesmo tempo; devolve os ids que responderam.
    pub async fn reconnect_all(&self) -> Vec<String> {
        let ids: Vec<String> = self.inner.trust.lock().unwrap().devices.iter().map(|device| device.info.id.clone()).collect();
        let mut jobs = tokio::task::JoinSet::new();
        for id in ids {
            let node = self.clone();
            jobs.spawn(async move { node.reconnect(&id).await.ok().map(|_| id) });
        }
        let mut answered = Vec::new();
        while let Some(result) = jobs.join_next().await {
            if let Ok(Some(id)) = result {
                answered.push(id);
            }
        }
        answered
    }

    /// Guarda no histórico por onde a conexão passou (IP da rede local e/ou servidor de retransmissão).
    fn learn_paths(&self, id: &str, connection: &Connection) {
        let mut addrs: Vec<iroh::TransportAddr> = connection
            .paths()
            .iter()
            .map(|path| path.remote_addr().clone())
            .filter(|addr| matches!(addr, iroh::TransportAddr::Ip(_) | iroh::TransportAddr::Relay(_)))
            .collect();
        addrs.sort();
        addrs.dedup();
        let now = now_secs();
        let mut trust = self.inner.trust.lock().unwrap();
        let Some(mut device) = trust.get(id).cloned() else { return };
        let new_addrs = !addrs.is_empty() && addrs != device.addrs;
        if !new_addrs && now.saturating_sub(device.last_seen) < 60 {
            return;
        }
        if new_addrs {
            device.addrs = addrs;
        }
        device.last_seen = now;
        trust.upsert(device);
        let _ = trust.save();
    }

    pub fn show_code(&self) -> String {
        let code = PairCode::new(Instant::now());
        let text = code.code().to_string();
        *self.inner.code.lock().unwrap() = Some(code);
        text
    }

    pub fn trusts(&self, id: &str) -> bool {
        self.inner.trust.lock().unwrap().get(id).is_some()
    }

    pub fn forget(&self, id: &str) -> Result<(), String> {
        let mut trust = self.inner.trust.lock().unwrap();
        trust.remove(id);
        trust.save()?;
        drop(trust);
        (self.inner.on_change)();
        Ok(())
    }

    pub fn set_permissions(&self, id: &str, permissions: Permissions) -> Result<(), String> {
        let mut trust = self.inner.trust.lock().unwrap();
        let mut device = trust.get(id).cloned().ok_or("Computador não pareado.")?;
        device.permissions = permissions;
        trust.upsert(device);
        trust.save()?;
        drop(trust);
        (self.inner.on_change)();
        Ok(())
    }

    fn known_addrs(&self) -> Vec<EndpointAddr> {
        let mut addrs: HashMap<String, EndpointAddr> = HashMap::new();
        for (id, seen) in self.inner.seen.lock().unwrap().iter() {
            if let Some(addr) = &seen.addr {
                addrs.insert(id.clone(), addr.clone());
            }
        }
        for device in &self.inner.trust.lock().unwrap().devices {
            if let Ok(key) = device.info.id.parse::<PublicKey>() {
                let addr = addrs.remove(&device.info.id).unwrap_or_else(|| EndpointAddr::new(key));
                addrs.insert(device.info.id.clone(), addr.with_addrs(device.addrs.clone()));
            }
        }
        addrs.into_values().collect()
    }

    /// Endereço de um computador pelo id: o último visto; senão, só a chave (a descoberta local acha o resto).
    pub fn addr_of(&self, id: &str) -> Result<EndpointAddr, String> {
        let key = id.parse::<PublicKey>().map_err(|_| "Identificador de computador inválido.".to_string())?;
        let seen = self.inner.seen.lock().unwrap().get(id).and_then(|seen| seen.addr.clone());
        let saved = self.inner.trust.lock().unwrap().get(id).map(|device| device.addrs.clone()).unwrap_or_default();
        Ok(seen.unwrap_or_else(|| EndpointAddr::new(key)).with_addrs(saved))
    }

    fn remember(&self, mut info: DeviceInfo, id: String, addr: Option<EndpointAddr>) {
        info.id = id.clone();
        let mut seen = self.inner.seen.lock().unwrap();
        let addr = addr.or_else(|| seen.get(&id).and_then(|old| old.addr.clone()));
        let changed = seen.get(&id).map(|old| old.info != info || old.last.elapsed() > ONLINE_WINDOW).unwrap_or(true);
        seen.insert(id.clone(), Seen { info: info.clone(), addr, last: Instant::now() });
        drop(seen);
        // Mantém nome/modelos atualizados de quem já é confiável.
        let mut trust = self.inner.trust.lock().unwrap();
        if let Some(mut device) = trust.get(&id).cloned() {
            if device.info != info {
                device.info = info;
                trust.upsert(device);
                let _ = trust.save();
            }
        }
        drop(trust);
        if changed {
            (self.inner.on_change)();
        }
    }

    async fn open(&self, addr: EndpointAddr) -> Result<(Connection, iroh::endpoint::SendStream, BufReader<iroh::endpoint::RecvStream>), String> {
        let id = addr.id.to_string();
        let connection = self.inner.endpoint.connect(addr, ALPN).await.map_err(|error| {
            let name = self.inner.trust.lock().unwrap().get(&id).map(|device| device.info.name.clone()).or_else(|| self.inner.seen.lock().unwrap().get(&id).map(|seen| seen.info.name.clone()));
            dica_conexao(&error.to_string(), self.inner.internet, name.as_deref())
        })?;
        let (send, recv) = connection.open_bi().await.map_err(io)?;
        Ok((connection, send, BufReader::new(recv)))
    }

    /// Troca apresentações com outro computador (descobre nome, tipo, modelos).
    pub async fn hello(&self, addr: EndpointAddr) -> Result<DeviceInfo, String> {
        let (connection, mut send, mut recv) = self.open(addr.clone()).await?;
        write_message(&mut send, &Message::Hello { info: self.info() }).await?;
        let reply = read_message(&mut recv).await?;
        let _ = send.finish();
        match reply {
            Some(Message::Hello { info }) => {
                let id = connection.remote_id().to_string();
                self.remember(info.clone(), id.clone(), Some(addr));
                self.learn_paths(&id, &connection);
                Ok(DeviceInfo { id, ..info })
            }
            Some(Message::Error { message }) => Err(message),
            _ => Err("Resposta inesperada.".into()),
        }
    }

    /// Conecta a outro computador com o código que ele mostrou.
    pub async fn pair_with(&self, addr: EndpointAddr, code: &str) -> Result<(), String> {
        let info = self.hello(addr.clone()).await?;
        let (connection, mut send, mut recv) = self.open(addr).await?;
        write_message(&mut send, &Message::PairRequest { code: code.to_string(), info: self.info() }).await?;
        let reply = read_message(&mut recv).await?;
        let _ = send.finish();
        match reply {
            Some(Message::PairResult { ok: true, .. }) => {
                {
                    let mut trust = self.inner.trust.lock().unwrap();
                    trust.upsert(TrustedDevice { info, permissions: Permissions::default(), paired_at: now_secs(), addrs: Vec::new(), last_seen: now_secs() });
                    trust.save()?;
                }
                self.learn_paths(&connection.remote_id().to_string(), &connection);
                (self.inner.on_change)();
                Ok(())
            }
            Some(Message::PairResult { reason, .. }) => Err(reason.unwrap_or_else(|| "Pareamento recusado.".into())),
            Some(Message::Error { message }) => Err(message),
            _ => Err("Resposta inesperada.".into()),
        }
    }

    /// Pede uma resposta de chat ao Ollama de outro computador; cada pedaço chega por `on_delta`.
    pub async fn remote_chat(
        &self,
        addr: EndpointAddr,
        request: ChatRequestData,
        on_delta: &mut (dyn FnMut(serde_json::Value) + Send),
    ) -> Result<serde_json::Value, String> {
        let (connection, mut send, mut recv) = self.open(addr).await?;
        let cancel = request.cancel.clone();
        let watcher = {
            let connection = connection.clone();
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    if cancel.load(Ordering::SeqCst) {
                        connection.close(0u32.into(), b"cancelado");
                        break;
                    }
                }
            })
        };
        let result = async {
            write_message(&mut send, &Message::ChatRequest {
                request_id: request.request_id,
                model: request.model,
                messages: request.messages,
                think: request.think,
                think_level: request.think_level,
                options: request.options,
            })
            .await?;
            loop {
                match read_message(&mut recv).await? {
                    Some(Message::ChatDelta { delta }) => on_delta(delta),
                    Some(Message::ChatDone { result }) => return Ok(result),
                    Some(Message::Error { message }) => return Err(message),
                    Some(_) => return Err("Resposta inesperada.".into()),
                    None => return Err("O outro computador encerrou a conexão.".into()),
                }
            }
        }
        .await;
        watcher.abort();
        let _ = send.finish();
        result
    }

    /// Manda uma tarefa para o agente de outro computador (ele age lá) e espera a resposta.
    pub async fn remote_agent(&self, addr: EndpointAddr, request_id: &str, task: &str) -> Result<String, String> {
        let (_connection, mut send, mut recv) = self.open(addr).await?;
        write_message(&mut send, &Message::AgentTask { request_id: request_id.into(), task: task.into() }).await?;
        let reply = read_message(&mut recv).await?;
        let _ = send.finish();
        match reply {
            Some(Message::AgentResult { ok: true, text }) => Ok(text),
            Some(Message::AgentResult { text, .. }) | Some(Message::Error { message: text }) => Err(text),
            None => Err("O outro computador encerrou a conexão.".into()),
            _ => Err("Resposta inesperada.".into()),
        }
    }

    /// Manda o instalador para outro computador (fase 3). Ele pergunta na tela de lá; se aceitarem, o arquivo vai em
    /// pedaços e o outro lado confere assinatura + SHA-256 antes de instalar. `on_progress(enviado, total)`.
    pub async fn send_update(&self, addr: EndpointAddr, file: &InstallerFile, sha256: &str, on_progress: &mut (dyn FnMut(u64, u64) + Send)) -> Result<String, String> {
        use base64::Engine;
        use tokio::io::AsyncReadExt;
        let (_connection, mut send, mut recv) = self.open(addr).await?;
        let signature = update::sign(&self.inner.key, &file.version, file.size, sha256);
        write_message(&mut send, &Message::UpdateOffer { version: file.version.clone(), file_name: file.file_name.clone(), size: file.size, sha256: sha256.into(), signature }).await?;
        match read_message(&mut recv).await? {
            Some(Message::UpdateReply { accept: true, .. }) => {}
            Some(Message::UpdateReply { reason, .. }) => return Err(reason.unwrap_or_else(|| "Recusado no outro computador.".into())),
            Some(Message::Error { message }) => return Err(message),
            None => return Err("O outro computador encerrou a conexão.".into()),
            _ => return Err("Resposta inesperada.".into()),
        }
        let mut source = tokio::fs::File::open(&file.path).await.map_err(io)?;
        let mut buffer = vec![0u8; update::CHUNK];
        let mut sent = 0u64;
        while sent < file.size {
            let read = source.read(&mut buffer).await.map_err(io)?;
            if read == 0 {
                break;
            }
            let read = read.min((file.size - sent) as usize);
            write_message(&mut send, &Message::UpdateChunk { data: base64::engine::general_purpose::STANDARD.encode(&buffer[..read]) }).await?;
            sent += read as u64;
            on_progress(sent, file.size);
        }
        let reply = read_message(&mut recv).await?;
        let _ = send.finish();
        match reply {
            Some(Message::UpdateResult { ok: true, text }) => Ok(text),
            Some(Message::UpdateResult { text, .. }) | Some(Message::Error { message: text }) => Err(text),
            None => Err("O outro computador encerrou a conexão.".into()),
            _ => Err("Resposta inesperada.".into()),
        }
    }

    /// Recebe os pedaços do instalador em `rede\atualizacoes\` e confere tamanho, `MZ` e SHA-256.
    async fn receive_update(&self, recv: &mut BufReader<iroh::endpoint::RecvStream>, file_name: &str, size: u64, sha256: &str) -> Result<PathBuf, String> {
        use base64::Engine;
        use tokio::io::AsyncWriteExt;
        let dir = self.inner.dir.join("atualizacoes");
        tokio::fs::create_dir_all(&dir).await.map_err(io)?;
        let path = dir.join(file_name);
        let outcome = async {
            let mut target = tokio::fs::File::create(&path).await.map_err(io)?;
            let mut received = 0u64;
            while received < size {
                match read_message(recv).await? {
                    Some(Message::UpdateChunk { data }) => {
                        let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| "Pedaço do instalador inválido.".to_string())?;
                        received += bytes.len() as u64;
                        if received > size {
                            return Err("O instalador veio maior que o anunciado.".to_string());
                        }
                        target.write_all(&bytes).await.map_err(io)?;
                    }
                    None => return Err("A conexão caiu no meio do envio.".into()),
                    _ => return Err("Resposta inesperada.".into()),
                }
            }
            target.flush().await.map_err(io)?;
            drop(target);
            let (check_path, sha256) = (path.clone(), sha256.to_string());
            tokio::task::spawn_blocking(move || update::check_received(&check_path, size, &sha256)).await.map_err(io)?
        }
        .await;
        match outcome {
            Ok(()) => Ok(path),
            Err(error) => {
                let _ = tokio::fs::remove_file(&path).await;
                Err(error)
            }
        }
    }

    /// Todos os computadores para a página Rede: este, os confiáveis e os descobertos na rede local.
    pub fn devices(&self) -> Vec<NetDeviceView> {
        let me = self.info();
        let mut list = vec![NetDeviceView {
            id: me.id.clone(),
            name: me.name,
            kind: me.kind,
            os: me.os,
            mac: me.mac,
            gpu: me.gpu,
            models: me.models,
            online: true,
            paired: true,
            is_self: true,
            link: None,
            permissions: None,
            last_seen: None,
            addrs: Vec::new(),
        }];
        let seen = self.inner.seen.lock().unwrap().clone();
        let lan = self.inner.lan.lock().unwrap().clone();
        let link = |id: &str| Some(if lan.contains(id) { "local" } else { "internet" }.to_string());
        let trust = self.inner.trust.lock().unwrap();
        for device in &trust.devices {
            let recent = seen.get(&device.info.id);
            let info = recent.map(|s| s.info.clone()).unwrap_or_else(|| device.info.clone());
            list.push(NetDeviceView {
                id: device.info.id.clone(),
                name: info.name,
                kind: info.kind,
                os: info.os,
                mac: info.mac,
                gpu: info.gpu,
                models: info.models,
                online: recent.is_some_and(|s| s.last.elapsed() < ONLINE_WINDOW),
                paired: true,
                is_self: false,
                link: link(&device.info.id),
                permissions: Some(device.permissions.clone()),
                last_seen: Some(if recent.is_some_and(|s| s.last.elapsed() < ONLINE_WINDOW) { now_secs() } else { device.last_seen }).filter(|at| *at > 0),
                addrs: device.addrs.iter().map(addr_label).collect(),
            });
        }
        for (id, s) in &seen {
            if trust.get(id).is_some() || *id == me.id {
                continue;
            }
            list.push(NetDeviceView {
                id: id.clone(),
                name: s.info.name.clone(),
                kind: s.info.kind,
                os: s.info.os.clone(),
                mac: s.info.mac.clone(),
                gpu: s.info.gpu.clone(),
                models: Vec::new(),
                online: s.last.elapsed() < ONLINE_WINDOW,
                paired: false,
                is_self: false,
                link: link(id),
                permissions: None,
                last_seen: None,
                addrs: Vec::new(),
            });
        }
        list
    }

    pub async fn shutdown(&self) {
        self.inner.alive.store(false, Ordering::SeqCst);
        let router = self.inner.router.lock().unwrap().take();
        if let Some(router) = router {
            let _ = router.shutdown().await;
        }
        self.inner.endpoint.close().await;
    }

    /// Atende uma conexão que chegou (lado de quem recebe).
    async fn serve(&self, connection: Connection) -> Result<(), String> {
        let remote = connection.remote_id().to_string();
        let (mut send, recv) = connection.accept_bi().await.map_err(io)?;
        let mut recv = BufReader::new(recv);
        let first = read_message(&mut recv).await?;
        let trusted = self.trusts(&remote);
        if trusted {
            self.learn_paths(&remote, &connection);
        }
        let mut install_after: Option<PathBuf> = None;
        match first {
            Some(Message::Hello { info }) => {
                if !self.visible() && !trusted {
                    write_message(&mut send, &Message::Error { message: "Computador invisível na rede.".into() }).await?;
                } else {
                    self.remember(info, remote, None);
                    write_message(&mut send, &Message::Hello { info: self.info() }).await?;
                }
            }
            Some(Message::PairRequest { code, mut info }) => {
                let check = {
                    let mut current = self.inner.code.lock().unwrap();
                    match current.as_mut() {
                        Some(pair) => pair.check(&code, Instant::now()),
                        None => PairCheck::Locked,
                    }
                };
                if check == PairCheck::Ok {
                    info.id = remote.clone();
                    {
                        let mut trust = self.inner.trust.lock().unwrap();
                        trust.upsert(TrustedDevice { info, permissions: Permissions::default(), paired_at: now_secs(), addrs: Vec::new(), last_seen: now_secs() });
                        trust.save()?;
                    }
                    self.learn_paths(&remote, &connection);
                    (self.inner.on_change)();
                    write_message(&mut send, &Message::PairResult { ok: true, reason: None }).await?;
                } else {
                    write_message(&mut send, &Message::PairResult { ok: false, reason: Some(check.reason().into()) }).await?;
                }
            }
            Some(Message::ChatRequest { request_id, model, messages, think, think_level, options }) => {
                let asker = self.inner.trust.lock().unwrap().get(&remote).filter(|device| device.permissions.usar_ia).map(|device| device.info.name.clone());
                if let Some(from_name) = asker {
                    let cancel = Arc::new(AtomicBool::new(false));
                    let data = ChatRequestData { request_id, model, messages, think, think_level, options, cancel: cancel.clone(), from_name };
                    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<serde_json::Value>();
                    let executor = self.inner.executor.clone();
                    let job = tokio::task::spawn_blocking(move || executor(data, &mut |delta| {
                        let _ = tx.send(delta);
                    }));
                    while let Some(delta) = rx.recv().await {
                        if write_message(&mut send, &Message::ChatDelta { delta }).await.is_err() {
                            cancel.store(true, Ordering::SeqCst);
                        }
                    }
                    let outcome = job.await.map_err(io)?;
                    let reply = match outcome {
                        Ok(result) => Message::ChatDone { result },
                        Err(message) => Message::Error { message },
                    };
                    let _ = write_message(&mut send, &reply).await;
                } else {
                    write_message(&mut send, &Message::Error { message: "Este computador não tem permissão para usar a IA daqui.".into() }).await?;
                }
            }
            Some(Message::AgentTask { request_id, task }) => {
                let device = self.inner.trust.lock().unwrap().get(&remote).cloned();
                let reply = match device {
                    None => Message::Error { message: "Este computador não está conectado a este aqui.".into() },
                    Some(device) => {
                        let needs_confirm = !device.permissions.controlar;
                        self.inner.log.info("tarefa_recebida", serde_json::json!({ "de": device.info.name, "deId": remote, "taskId": request_id, "precisaConfirmar": needs_confirm, "tarefa": task.chars().take(300).collect::<String>() }));
                        let task_id = request_id.clone();
                        let data = AgentTaskData { request_id, task, from_id: remote.clone(), from_name: device.info.name.clone(), needs_confirm };
                        let reply = match tokio::time::timeout(Duration::from_secs(600), (self.inner.agent)(data)).await {
                            Ok(Ok(text)) => Message::AgentResult { ok: true, text },
                            Ok(Err(text)) => Message::AgentResult { ok: false, text },
                            Err(_) => Message::AgentResult { ok: false, text: "A tarefa passou de 10 minutos e foi encerrada.".into() },
                        };
                        if let Message::AgentResult { ok, text } = &reply {
                            let summary: String = text.chars().take(300).collect();
                            let fields = if *ok { serde_json::json!({ "taskId": task_id, "ok": true, "resposta": summary }) } else { serde_json::json!({ "taskId": task_id, "ok": false, "erro": summary }) };
                            self.inner.log.info("tarefa_concluida", fields);
                        }
                        reply
                    }
                };
                write_message(&mut send, &reply).await?;
            }
            Some(Message::UpdateOffer { version, file_name, size, sha256, signature }) => {
                let device = self.inner.trust.lock().unwrap().get(&remote).cloned();
                let refusal = match &device {
                    None => Some("Este computador não está conectado a este aqui.".to_string()),
                    Some(device) if !device.permissions.atualizar => Some("O outro computador não permite instalar atualizações vindas daqui (conecte os dois de novo pela tela Remoto).".to_string()),
                    Some(_) => update::check_offer(&file_name, size, &sha256).and_then(|_| update::verify(&connection.remote_id(), &version, size, &sha256, &signature)).err(),
                };
                match (refusal, device) {
                    (None, Some(device)) => {
                        let offer = UpdateOfferData { from_id: remote.clone(), from_name: device.info.name.clone(), version: version.clone(), file_name: file_name.clone(), size };
                        let decision = tokio::time::timeout(Duration::from_secs(300), (self.inner.update_asker)(offer)).await.unwrap_or(UpdateDecision::Later);
                        if decision != UpdateDecision::Now {
                            write_message(&mut send, &Message::UpdateReply { accept: false, reason: Some("Deixaram para depois no outro computador.".into()) }).await?;
                        } else {
                            write_message(&mut send, &Message::UpdateReply { accept: true, reason: None }).await?;
                            let reply = match self.receive_update(&mut recv, &file_name, size, &sha256).await {
                                Ok(path) => {
                                    install_after = Some(path);
                                    Message::UpdateResult { ok: true, text: format!("Instalando a versão {version} em {}.", self.info().name) }
                                }
                                Err(text) => Message::UpdateResult { ok: false, text },
                            };
                            write_message(&mut send, &reply).await?;
                        }
                    }
                    (refusal, _) => {
                        write_message(&mut send, &Message::Error { message: refusal.unwrap_or_default() }).await?;
                    }
                }
            }
            _ => {
                write_message(&mut send, &Message::Error { message: "Pedido desconhecido.".into() }).await?;
            }
        }
        let _ = send.finish();
        // Espera o outro lado ler antes de fechar a conexão.
        let _ = tokio::time::timeout(Duration::from_secs(5), connection.closed()).await;
        // Só instala depois de responder (o instalador fecha este app).
        if let Some(path) = install_after {
            (self.inner.update_installer)(path)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct Handler {
    node: Node,
}

#[derive(Debug)]
struct ServeError(String);
impl std::fmt::Display for ServeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for ServeError {}

impl ProtocolHandler for Handler {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let from = connection.remote_id().to_string();
        self.node.serve(connection).await.map_err(|error| {
            self.node.inner.log.warn("conexao_recebida_falhou", serde_json::json!({ "de": from, "erro": error }));
            AcceptError::from_err(ServeError(error))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_result(text: &str) -> serde_json::Value {
        serde_json::json!({ "model": "qwen3.5:9b", "content": text, "thinking": "", "cancelled": false, "evalCount": null, "evalDurationNs": null, "tokensPerSecond": null, "thinkingTokens": 0, "promptEvalCount": null, "toolCalls": [] })
    }

    fn fake(text: &'static str) -> impl Fn(ChatRequestData, &mut dyn FnMut(serde_json::Value)) -> Result<serde_json::Value, String> + Send + Sync + 'static {
        move |request, on_delta| {
            on_delta(serde_json::json!({ "requestId": request.request_id, "content": text, "thinking": "", "thinkingTokens": 0 }));
            Ok(fake_result(text))
        }
    }

    fn chat(id: &str, messages: serde_json::Value) -> ChatRequestData {
        ChatRequestData { request_id: id.into(), model: "qwen3.5:9b".into(), messages, think: None, think_level: None, options: None, cancel: Arc::new(AtomicBool::new(false)), from_name: String::new() }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn two_nodes_pair_by_code_and_chat() {
        let a = Node::start_for_test("a", fake("oi do A")).await.unwrap();
        let b = Node::start_for_test("b", fake("não usado")).await.unwrap();
        let code = a.show_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        assert!(a.trusts(&b.id()));
        assert!(b.trusts(&a.id()));
        let mut deltas = Vec::new();
        let result = b.remote_chat(a.addr(), chat("r1", serde_json::json!([{ "role": "user", "content": "oi" }])), &mut |delta| deltas.push(delta)).await.unwrap();
        assert_eq!(result["content"], "oi do A");
        assert_eq!(deltas.len(), 1);
        assert_eq!(deltas[0]["content"], "oi do A");
        // A página Rede de B mostra A pareado, online e com os modelos.
        let view = b.devices();
        let other = view.iter().find(|d| d.id == a.id()).unwrap();
        assert!(other.paired && other.online);
        assert_eq!(other.models, vec!["qwen3.5:9b".to_string()]);
        a.shutdown().await;
        b.shutdown().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn wrong_code_and_unpaired_chat_are_refused() {
        let a = Node::start_for_test("a2", fake("x")).await.unwrap();
        let b = Node::start_for_test("b2", fake("x")).await.unwrap();
        let code = a.show_code();
        let wrong = if code == "000000" { "111111" } else { "000000" };
        assert_eq!(b.pair_with(a.addr(), wrong).await.unwrap_err(), "Código errado.");
        assert!(!b.trusts(&a.id()));
        let refused = b.remote_chat(a.addr(), chat("r2", serde_json::json!([])), &mut |_| {}).await;
        assert!(refused.unwrap_err().contains("não tem permissão"));
        a.shutdown().await;
        b.shutdown().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn agent_task_needs_pairing_and_permission() {
        let a = Node::start_for_test("a4", fake("x")).await.unwrap();
        let b = Node::start_for_test("b4", fake("x")).await.unwrap();
        // Sem pareamento: recusado.
        assert!(b.remote_agent(a.addr(), "t0", "abra a calculadora").await.unwrap_err().contains("não está conectado"));
        let code = a.show_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        // Pareado já vem com tudo ligado.
        assert_eq!(b.remote_agent(a.addr(), "t0b", "abra a calculadora").await.unwrap(), "feito: abra a calculadora");
        a.set_permissions(&b.id(), Permissions { usar_ia: true, controlar: false, atualizar: false }).unwrap();
        // "Controlar este PC" desligado: o PC de destino decide (o executor de teste recusa).
        assert_eq!(b.remote_agent(a.addr(), "t1", "abra a calculadora").await.unwrap_err(), "Recusado neste computador.");
        a.set_permissions(&b.id(), Permissions { usar_ia: true, controlar: true, atualizar: false }).unwrap();
        assert_eq!(b.remote_agent(a.addr(), "t2", "abra a calculadora").await.unwrap(), "feito: abra a calculadora");
        a.shutdown().await;
        b.shutdown().await;
    }

    fn fake_installer(name: &str) -> (InstallerFile, String) {
        let dir = std::env::temp_dir().join(format!("oa-installer-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // Maior que um pedaço, para testar o envio em partes.
        let mut bytes = b"MZ".to_vec();
        bytes.extend((0..update::CHUNK + 1234).map(|i| (i % 251) as u8));
        let path = dir.join("Open Assistant_0.2.0_x64-setup.exe");
        std::fs::write(&path, &bytes).unwrap();
        let sha = update::sha256_hex(&bytes);
        (update::find_installer(&[dir]).unwrap(), sha)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn update_needs_permission_and_confirmation_then_installs() {
        let installed: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));
        let record = installed.clone();
        let a = Node::start_for_test_with("a5", fake("x"), UpdateDecision::Now, Arc::new(move |path| {
            record.lock().unwrap().push(path);
            Ok(())
        }))
        .await
        .unwrap();
        let b = Node::start_for_test("b5", fake("x")).await.unwrap();
        let (file, sha) = fake_installer("5");
        // Sem pareamento: recusado.
        assert!(b.send_update(a.addr(), &file, &sha, &mut |_, _| {}).await.unwrap_err().contains("não está conectado"));
        let code = a.show_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        a.set_permissions(&b.id(), Permissions { usar_ia: true, controlar: false, atualizar: false }).unwrap();
        // Pareado, mas "Instalar atualizações aqui" desligado: recusado.
        assert!(b.send_update(a.addr(), &file, &sha, &mut |_, _| {}).await.unwrap_err().contains("não permite instalar"));
        a.set_permissions(&b.id(), Permissions { usar_ia: true, controlar: false, atualizar: true }).unwrap();
        // SHA-256 que não bate com a assinatura/arquivo: recusado.
        assert!(b.send_update(a.addr(), &file, &update::sha256_hex(b"outro"), &mut |_, _| {}).await.is_err());
        assert!(installed.lock().unwrap().is_empty());
        let mut progress = Vec::new();
        let text = b.send_update(a.addr(), &file, &sha, &mut |sent, total| progress.push((sent, total))).await.unwrap();
        assert!(text.contains("0.2.0"));
        assert_eq!(progress.len(), 2);
        assert_eq!(progress.last(), Some(&(file.size, file.size)));
        tokio::time::sleep(Duration::from_millis(300)).await;
        let paths = installed.lock().unwrap().clone();
        assert_eq!(paths.len(), 1);
        assert_eq!(std::fs::read(&paths[0]).unwrap(), std::fs::read(&file.path).unwrap());
        a.shutdown().await;
        b.shutdown().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn update_left_for_later_is_not_installed() {
        let installed: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));
        let record = installed.clone();
        let a = Node::start_for_test_with("a6", fake("x"), UpdateDecision::Later, Arc::new(move |path| {
            record.lock().unwrap().push(path);
            Ok(())
        }))
        .await
        .unwrap();
        let b = Node::start_for_test("b6", fake("x")).await.unwrap();
        let (file, sha) = fake_installer("6");
        let code = a.show_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        a.set_permissions(&b.id(), Permissions { usar_ia: true, controlar: false, atualizar: true }).unwrap();
        assert!(b.send_update(a.addr(), &file, &sha, &mut |_, _| {}).await.unwrap_err().contains("depois"));
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(installed.lock().unwrap().is_empty());
        a.shutdown().await;
        b.shutdown().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn code_stays_while_valid_and_history_keeps_addresses() {
        let a = Node::start_for_test("a7", fake("x")).await.unwrap();
        let b = Node::start_for_test("b7", fake("x")).await.unwrap();
        let (code, left) = a.current_code();
        assert!(left > 290);
        assert_eq!(a.current_code().0, code);
        b.pair_with(a.addr(), &code).await.unwrap();
        // Código usado: aparece outro.
        assert_ne!(a.current_code().0, code);
        // O histórico guardou por onde conectou, dos dois lados.
        let saved = b.inner.trust.lock().unwrap().get(&a.id()).unwrap().clone();
        assert!(!saved.addrs.is_empty());
        assert!(saved.last_seen > 0);
        assert!(a.inner.trust.lock().unwrap().get(&b.id()).is_some_and(|device| !device.addrs.is_empty()));
        // Sem o que a descoberta viu, o endereço salvo basta para reconectar.
        b.inner.seen.lock().unwrap().clear();
        let info = b.reconnect(&a.id()).await.unwrap();
        assert_eq!(info.name, "a7");
        assert!(b.devices().iter().any(|device| device.id == a.id() && device.online && device.last_seen.is_some()));
        a.shutdown().await;
        b.shutdown().await;
    }

    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oa-node-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn saved_port_is_reused_and_busy_port_falls_back() {
        let dir = test_dir("porta");
        let key = SecretKey::generate();
        let first = Node::start_for_test_at("p1", dir.clone(), key.clone(), false).await.unwrap();
        let port = first.port();
        assert!(port > 0);
        assert_eq!(load_port(&dir), Some(port));
        first.shutdown().await;
        drop(first);
        // Reabrir: mesma porta.
        let again = Node::start_for_test_at("p1", dir.clone(), key.clone(), false).await.unwrap();
        assert_eq!(again.port(), port);
        // Outro app segurando a porta: abre em outra e regrava porta.json.
        let other_dir = test_dir("porta-outro");
        save_port(&other_dir, port);
        let busy = Node::start_for_test_at("p2", other_dir.clone(), SecretKey::generate(), false).await.unwrap();
        assert_ne!(busy.port(), port);
        assert_eq!(load_port(&other_dir), Some(busy.port()));
        assert!(super::super::netlog::read_tail(&other_dir, 10, true).iter().any(|line| line["event"] == "porta_ocupada"));
        again.shutdown().await;
        busy.shutdown().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn old_pair_without_addresses_gives_a_portuguese_hint() {
        let dir = test_dir("sem-endereco");
        let key = SecretKey::generate();
        let lonely = SecretKey::generate().public().to_string();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("confiaveis.json"), format!(r#"[{{"info":{{"id":"{lonely}","name":"Andres-MacBook-Pro","kind":"macbook","os":"macOS","mac":null,"gpu":null,"models":[]}},"permissions":{{"usarIA":true,"controlar":true,"atualizar":true}},"pairedAt":1}}]"#)).unwrap();
        let node = Node::start_for_test_at("pc", dir.clone(), key, false).await.unwrap();
        let error = node.reconnect(&lonely).await.unwrap_err();
        assert!(error.contains("Este PC não sabe onde Andres-MacBook-Pro está"), "{error}");
        assert!(error.contains("Ligue \"Internet\" nos dois"), "{error}");
        assert!(error.contains("(No addressing information"), "{error}");
        node.shutdown().await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn log_marks_offline_once_and_online_on_return() {
        let dir_a = test_dir("log-a");
        let key_a = SecretKey::generate();
        let a = Node::start_for_test_at("a8", dir_a.clone(), key_a.clone(), false).await.unwrap();
        let b = Node::start_for_test_at("b8", test_dir("log-b"), SecretKey::generate(), false).await.unwrap();
        let (code, _) = a.current_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        a.shutdown().await;
        drop(a);
        b.inner.seen.lock().unwrap().clear();
        let count = |event: &str| super::super::netlog::read_tail(&b.dir(), 200, false).iter().filter(|line| line["event"] == event).count();
        b.reconnect_sweep().await;
        b.reconnect_sweep().await;
        assert_eq!(count("pareado_sem_resposta"), 1);
        // A reabre (mesma chave, mesma porta): B acha pelos endereços salvos.
        let a2 = Node::start_for_test_at("a8", dir_a, key_a, false).await.unwrap();
        b.reconnect_sweep().await;
        b.reconnect_sweep().await;
        let lines = super::super::netlog::read_tail(&b.dir(), 200, false);
        let online: Vec<_> = lines.iter().filter(|line| line["event"] == "pareado_online").collect();
        assert_eq!(online.len(), 1, "{lines:?}");
        assert_eq!(online.last().unwrap()["nome"], "a8");
        assert_eq!(count("pareado_sem_resposta"), 1);
        a2.shutdown().await;
        b.shutdown().await;
    }

    #[test]
    fn connection_hints() {
        assert!(dica_conexao("No addressing information available", true, Some("Mac")).contains("Confira se \"Internet\" está ligada também nele"));
        assert_eq!(dica_conexao(SEM_RESPOSTA, false, None), "O outro computador não respondeu: o Open Assistant está aberto nele? O firewall libera o app?");
        assert!(dica_conexao("connection refused", false, Some("Mac")).starts_with("Não foi possível conectar a Mac. Se ele estiver em outra rede"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn permission_off_blocks_chat() {
        let a = Node::start_for_test("a3", fake("x")).await.unwrap();
        let b = Node::start_for_test("b3", fake("x")).await.unwrap();
        let code = a.show_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        a.set_permissions(&b.id(), Permissions { usar_ia: false, controlar: false, atualizar: false }).unwrap();
        let refused = b.remote_chat(a.addr(), chat("r3", serde_json::json!([])), &mut |_| {}).await;
        assert!(refused.unwrap_err().contains("não tem permissão"));
        a.shutdown().await;
        b.shutdown().await;
    }
}
