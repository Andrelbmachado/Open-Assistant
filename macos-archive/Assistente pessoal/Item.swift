//
//  Item.swift
//  Assistente pessoal
//
//  Created by André Machado on 08/07/26.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
