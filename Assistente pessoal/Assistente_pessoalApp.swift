//
//  Assistente_pessoalApp.swift
//  Assistente pessoal
//
//  Created by André Machado on 08/07/26.
//

import SwiftUI

@main
struct Assistente_pessoalApp: App {
    @StateObject private var store = AssistantStore()

    var body: some Scene {
        WindowGroup("Assistente Pessoal") {
            ContentView()
                .environmentObject(store)
                .frame(minWidth: 980, minHeight: 660)
        }
        .defaultSize(width: 1280, height: 820)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Novo Chat") { store.startNewChat() }
                    .keyboardShortcut("n", modifiers: .command)
            }

            CommandMenu("Open Assistant") {
                Button("Abrir Paleta de Comandos") {
                    store.commandPaletteOpen.toggle()
                }
                .keyboardShortcut("k", modifiers: .command)

                Divider()

                Button("Chat") { store.selectSection(.chat) }
                    .keyboardShortcut("1", modifiers: .command)
                Button("Agentes") { store.selectSection(.agents) }
                    .keyboardShortcut("2", modifiers: .command)
                Button("Workflow") { store.selectSection(.workflows) }
                    .keyboardShortcut("3", modifiers: .command)
                Button("Terminais") { store.selectSection(.terminals) }
                    .keyboardShortcut("4", modifiers: .command)
                Button("Arquivos") { store.selectSection(.files) }
                    .keyboardShortcut("5", modifiers: .command)
                Button("Marketplace") { store.openMarketplace() }
                    .keyboardShortcut("6", modifiers: .command)

                Divider()

                Button("Novo Dashboard no Projeto") {
                    if let projectId = store.contextProjectId { store.createDashboard(in: projectId) }
                }
                .keyboardShortcut("d", modifiers: [.command, .shift])
                .disabled(store.contextProjectId == nil)

                Button("Editor de Fotos") { store.openWorkspace(kind: .photoEditor) }
                    .keyboardShortcut("p", modifiers: [.command, .option])
                Button("Editor de Vídeos") { store.openWorkspace(kind: .videoEditor) }
                    .keyboardShortcut("v", modifiers: [.command, .option])

                Divider()

                Button(store.sidebarCollapsed ? "Mostrar Sidebar" : "Ocultar Sidebar") {
                    store.sidebarCollapsed.toggle()
                }
                .keyboardShortcut("s", modifiers: [.command, .control])

                Button("Executar Workflow Diário") {
                    store.selectSection(.workflows)
                    store.runWorkflow()
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }
        }

        Settings {
            SettingsView()
                .environmentObject(store)
                .frame(width: 920, height: 640)
        }
        .windowResizability(.contentSize)
    }
}
