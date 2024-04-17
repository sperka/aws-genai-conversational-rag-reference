$version: "2"
namespace com.amazon

/// A sample smithy websocket api
@websocketJson
@connectHandler(language: "typescript")
@disconnectHandler(language: "typescript")
service WsApi {
    version: "1.0"
    operations: [
      SubscribeToNotifications
      SendNotification
    ]
}