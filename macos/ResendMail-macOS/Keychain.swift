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
    // ThisDeviceOnly so the API key never replicates via iCloud Keychain.
    add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
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

  // Generate a cryptographically-random key (hex) for at-rest DB encryption.
  // Uses SecRandomCopyBytes (CSPRNG) — never Math.random in JS.
  @objc(randomKey:resolver:rejecter:)
  func randomKey(_ byteCount: NSNumber,
                 resolver resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
    let count = max(16, min(byteCount.intValue, 64))
    var bytes = [UInt8](repeating: 0, count: count)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    if status == errSecSuccess {
      resolve(bytes.map { String(format: "%02x", $0) }.joined())
    } else {
      reject("keychain_random", "status \(status)", nil)
    }
  }
}
