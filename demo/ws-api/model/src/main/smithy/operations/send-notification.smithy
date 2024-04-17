$version: "2"
namespace com.amazon


@async(direction: "server_to_client")
operation SendNotification {
    input := {
        @required
        topic: String

        @required
        title: String

        @required
        message: String
    }
}
