import Combine
import Foundation
import StoreKit

enum MarketplaceKind: String, Sendable {
    case mcp
    case skill
}

enum MarketplacePurchaseError: LocalizedError {
    case productNotConfigured(String)
    case cancelled
    case pending
    case unverified
    case unknown

    var errorDescription: String? {
        switch self {
        case .productNotConfigured(let id):
            return "O produto \(id) ainda não existe no App Store Connect. Cadastre esse ID para habilitar a compra real."
        case .cancelled: return "A compra foi cancelada."
        case .pending: return "A compra está pendente de aprovação."
        case .unverified: return "A App Store não conseguiu verificar a transação."
        case .unknown: return "A App Store retornou um resultado de compra desconhecido."
        }
    }
}

@MainActor
final class MarketplacePurchaseService: ObservableObject {
    @Published private(set) var isPurchasing = false

    func productID(for item: MarketplaceItem, kind: MarketplaceKind) -> String {
        "Andre.Assistente-pessoal.marketplace.\(kind.rawValue).\(item.id)"
    }

    func localizedPrice(for item: MarketplaceItem, kind: MarketplaceKind) async -> String? {
        let id = productID(for: item, kind: kind)
        return try? await Product.products(for: [id]).first?.displayPrice
    }

    func purchase(_ item: MarketplaceItem, kind: MarketplaceKind) async throws {
        let id = productID(for: item, kind: kind)
        guard let product = try await Product.products(for: [id]).first else {
            throw MarketplacePurchaseError.productNotConfigured(id)
        }

        isPurchasing = true
        defer { isPurchasing = false }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            guard case .verified(let transaction) = verification else {
                throw MarketplacePurchaseError.unverified
            }
            await transaction.finish()
        case .userCancelled:
            throw MarketplacePurchaseError.cancelled
        case .pending:
            throw MarketplacePurchaseError.pending
        @unknown default:
            throw MarketplacePurchaseError.unknown
        }
    }
}
