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
use super::protocol::{read_message, write_message, Message, ALPN};

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
    pub on_change: Arc<dyn Fn() + Send + Sync>,
}

struct Inner {
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
        // `Minimal`: nada é publicado na internet; na fase 1 só a rede local (mDNS) e endereços diretos.
        let endpoint = if config.internet {
            Endpoint::builder(presets::N0).secret_key(config.key.clone()).alpns(vec![ALPN.to_vec()]).bind().await.map_err(io)?
        } else {
            Endpoint::builder(presets::Minimal).secret_key(config.key.clone()).alpns(vec![ALPN.to_vec()]).bind().await.map_err(io)?
        };
        let mut info = config.info;
        info.id = endpoint.id().to_string();
        let node = Node {
            inner: Arc::new(Inner {
                endpoint: endpoint.clone(),
                router: Mutex::new(None),
                info: Mutex::new(info),
                trust: Mutex::new(TrustStore::load(&config.dir.join("confiaveis.json"))),
                code: Mutex::new(None),
                seen: Mutex::new(HashMap::new()),
                lan: Mutex::new(HashSet::new()),
                executor: config.executor,
                agent: config.agent,
                on_change: config.on_change,
                visible: AtomicBool::new(true),
                internet: config.internet,
            }),
        };
        let router = Router::builder(endpoint.clone()).accept(ALPN, Handler { node: node.clone() }).spawn();
        *node.inner.router.lock().unwrap() = Some(router);
        if config.mdns {
            node.start_mdns()?;
        }
        Ok(node)
    }

    fn start_mdns(&self) -> Result<(), String> {
        use iroh_mdns_address_lookup::{DiscoveryEvent, MdnsAddressLookup};
        use n0_future::StreamExt;
        let mdns = MdnsAddressLookup::builder().service_name("open-assistant").build(self.inner.endpoint.id()).map_err(io)?;
        self.inner.endpoint.address_lookup().map_err(io)?.add(mdns.clone());
        let node = self.clone();
        tokio::spawn(async move {
            let mut events = mdns.subscribe().await;
            while let Some(event) = events.next().await {
                if let DiscoveryEvent::Discovered { endpoint_info, .. } = event {
                    let addr = endpoint_info.to_endpoint_addr();
                    node.inner.lan.lock().unwrap().insert(addr.id.to_string());
                    let node = node.clone();
                    tokio::spawn(async move {
                        let _ = node.hello(addr).await;
                    });
                }
            }
        });
        // A cada 10 s: Hello para quem já conhecemos (atualiza online/offline e a lista de modelos).
        let node = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(10)).await;
                for addr in node.known_addrs() {
                    let node = node.clone();
                    tokio::spawn(async move {
                        let _ = tokio::time::timeout(Duration::from_secs(8), node.hello(addr)).await;
                    });
                }
                (node.inner.on_change)();
            }
        });
        Ok(())
    }

    #[cfg(test)]
    pub async fn start_for_test(name: &str, executor: impl Fn(ChatRequestData, &mut dyn FnMut(serde_json::Value)) -> Result<serde_json::Value, String> + Send + Sync + 'static) -> Result<Node, String> {
        let dir = std::env::temp_dir().join(format!("oa-node-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let info = DeviceInfo { id: String::new(), name: name.into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: None, models: vec!["qwen3.5:9b".into()] };
        let agent: AgentExecutor = Arc::new(|task: AgentTaskData| Box::pin(async move { if task.needs_confirm { Err("Recusado neste computador.".to_string()) } else { Ok(format!("feito: {}", task.task)) } }));
        Node::start(NodeConfig { dir, key: SecretKey::generate(), info, mdns: false, internet: false, executor: Arc::new(executor), agent, on_change: Arc::new(|| {}) }).await
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
            if !addrs.contains_key(&device.info.id) {
                if let Ok(key) = device.info.id.parse::<PublicKey>() {
                    addrs.insert(device.info.id.clone(), EndpointAddr::new(key));
                }
            }
        }
        addrs.into_values().collect()
    }

    /// Endereço de um computador pelo id: o último visto; senão, só a chave (a descoberta local acha o resto).
    pub fn addr_of(&self, id: &str) -> Result<EndpointAddr, String> {
        if let Some(addr) = self.inner.seen.lock().unwrap().get(id).and_then(|seen| seen.addr.clone()) {
            return Ok(addr);
        }
        let key = id.parse::<PublicKey>().map_err(|_| "Identificador de computador inválido.".to_string())?;
        Ok(EndpointAddr::new(key))
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
        let connection = self.inner.endpoint.connect(addr, ALPN).await.map_err(|error| format!("Não foi possível conectar: {error}"))?;
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
                Ok(DeviceInfo { id, ..info })
            }
            Some(Message::Error { message }) => Err(message),
            _ => Err("Resposta inesperada.".into()),
        }
    }

    /// Conecta a outro computador com o código que ele mostrou.
    pub async fn pair_with(&self, addr: EndpointAddr, code: &str) -> Result<(), String> {
        let info = self.hello(addr.clone()).await?;
        let (_connection, mut send, mut recv) = self.open(addr).await?;
        write_message(&mut send, &Message::PairRequest { code: code.to_string(), info: self.info() }).await?;
        let reply = read_message(&mut recv).await?;
        let _ = send.finish();
        match reply {
            Some(Message::PairResult { ok: true, .. }) => {
                {
                    let mut trust = self.inner.trust.lock().unwrap();
                    trust.upsert(TrustedDevice { info, permissions: Permissions::default(), paired_at: now_secs() });
                    trust.save()?;
                }
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
            });
        }
        list
    }

    pub async fn shutdown(&self) {
        let router = self.inner.router.lock().unwrap().take();
        if let Some(router) = router {
            let _ = router.shutdown().await;
        }
    }

    /// Atende uma conexão que chegou (lado de quem recebe).
    async fn serve(&self, connection: Connection) -> Result<(), String> {
        let remote = connection.remote_id().to_string();
        let (mut send, recv) = connection.accept_bi().await.map_err(io)?;
        let mut recv = BufReader::new(recv);
        let first = read_message(&mut recv).await?;
        let trusted = self.trusts(&remote);
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
                        trust.upsert(TrustedDevice { info, permissions: Permissions::default(), paired_at: now_secs() });
                        trust.save()?;
                    }
                    (self.inner.on_change)();
                    write_message(&mut send, &Message::PairResult { ok: true, reason: None }).await?;
                } else {
                    write_message(&mut send, &Message::PairResult { ok: false, reason: Some(check.reason().into()) }).await?;
                }
            }
            Some(Message::ChatRequest { request_id, model, messages, think, think_level, options }) => {
                let allowed = self.inner.trust.lock().unwrap().get(&remote).is_some_and(|device| device.permissions.usar_ia);
                if !allowed {
                    write_message(&mut send, &Message::Error { message: "Este computador não tem permissão para usar a IA daqui.".into() }).await?;
                } else {
                    let cancel = Arc::new(AtomicBool::new(false));
                    let data = ChatRequestData { request_id, model, messages, think, think_level, options, cancel: cancel.clone() };
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
                }
            }
            Some(Message::AgentTask { request_id, task }) => {
                let device = self.inner.trust.lock().unwrap().get(&remote).cloned();
                let reply = match device {
                    None => Message::Error { message: "Este computador não está conectado a este aqui.".into() },
                    Some(device) => {
                        let data = AgentTaskData { request_id, task, from_id: remote.clone(), from_name: device.info.name.clone(), needs_confirm: !device.permissions.controlar };
                        match tokio::time::timeout(Duration::from_secs(600), (self.inner.agent)(data)).await {
                            Ok(Ok(text)) => Message::AgentResult { ok: true, text },
                            Ok(Err(text)) => Message::AgentResult { ok: false, text },
                            Err(_) => Message::AgentResult { ok: false, text: "A tarefa passou de 10 minutos e foi encerrada.".into() },
                        }
                    }
                };
                write_message(&mut send, &reply).await?;
            }
            _ => {
                write_message(&mut send, &Message::Error { message: "Pedido desconhecido.".into() }).await?;
            }
        }
        let _ = send.finish();
        // Espera o outro lado ler antes de fechar a conexão.
        let _ = tokio::time::timeout(Duration::from_secs(5), connection.closed()).await;
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
        self.node.serve(connection).await.map_err(|error| AcceptError::from_err(ServeError(error)))
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
        ChatRequestData { request_id: id.into(), model: "qwen3.5:9b".into(), messages, think: None, think_level: None, options: None, cancel: Arc::new(AtomicBool::new(false)) }
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
        // Pareado, mas "Controlar este PC" desligado: o PC de destino decide (o executor de teste recusa).
        assert_eq!(b.remote_agent(a.addr(), "t1", "abra a calculadora").await.unwrap_err(), "Recusado neste computador.");
        a.set_permissions(&b.id(), Permissions { usar_ia: true, controlar: true, atualizar: false }).unwrap();
        assert_eq!(b.remote_agent(a.addr(), "t2", "abra a calculadora").await.unwrap(), "feito: abra a calculadora");
        a.shutdown().await;
        b.shutdown().await;
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
