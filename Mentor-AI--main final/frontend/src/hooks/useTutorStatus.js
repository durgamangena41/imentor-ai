import { useEffect, useState } from "react";
import socket from "../services/socket";

export function useTutorStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    socket.on("tutor_status", (data) => {
      setStatus(data.state);
    });

    socket.on("tutor_message", () => {
      setStatus(null);
    });

    return () => {
      socket.off("tutor_status");
      socket.off("tutor_message");
    };
  }, []);

  return status;
}
