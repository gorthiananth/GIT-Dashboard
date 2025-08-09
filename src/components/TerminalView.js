import React, { useEffect, useRef } from "react";
import Terminal from 'terminal.js';
import "terminal.js/dist/terminal.css"; // Import styles if needed

const TerminalView = () => {
  const termRef = useRef(null);

  useEffect(() => {
    if (!termRef.current) return;
    // Create and mount terminal
    const terminal = new Terminal({
      prompt: "user@browser:~$ ",
      greeting: "Welcome!\nType help for commands."
    });
    terminal.mount(termRef.current);
    terminal.on("command", function(command) {
      if (command === "help") {
        terminal.echo("Available commands: help, echo, clear");
      } else if (command.startsWith("echo ")) {
        terminal.echo(command.slice(5));
      } else if (command === "clear") {
        terminal.clear();
      } else {
        terminal.echo("Unknown command: " + command);
      }
    });
    // Clean up
    return () => terminal.unmount();
  }, []);

  return <div ref={termRef} style={{ height: 300, width: "100%" }} />;
};

export default TerminalView;
