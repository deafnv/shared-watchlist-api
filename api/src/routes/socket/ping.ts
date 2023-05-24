import { Server, Socket } from "socket.io"

const ping = (io: Server, socket: Socket) => {
  socket.on("ping", (callback) => {
    callback()
  })
}

export default ping