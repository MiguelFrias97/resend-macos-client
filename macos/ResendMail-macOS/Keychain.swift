import Foundation
import Security
import React

@objc(Keychain)
class Keychain: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(setApiKey:key:resolver:rejecter:)
  func setApiKey(_ service: String, key: String,
                 resolver resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
    let data = key.data(using: .utf8)!
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked
    let status = SecItemAdd(add as CFDictionary, nil)
    if status == errSecSuccess { resolve(true) }
    else { reject("keychain_set", "status \(status)", nil) }
  }

  @objc(getApiKey:resolver:rejecter:)
  func getApiKey(_ service: String,
                 resolver resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data,
       let str = String(data: data, encoding: .utf8) {
      resolve(str)
    } else if status == errSecItemNotFound {
      resolve(nil)
    } else {
      reject("keychain_get", "status \(status)", nil)
    }
  }

  @objc(clearApiKey:resolver:rejecter:)
  func clearApiKey(_ service: String,
                   resolver resolve: RCTPromiseResolveBlock,
                   rejecter reject: RCTPromiseRejectBlock) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
    ]
    let status = SecItemDelete(query as CFDictionary)
    if status == errSecSuccess || status == errSecItemNotFound { resolve(true) }
    else { reject("keychain_clear", "status \(status)", nil) }
  }
}
