$version: "2"
namespace com.amazon


@handler(language: "typescript")
@async(direction: "client_to_server")
operation SubscribeToNotifications {
    input := {
        @required
        topic: String
    }
}
