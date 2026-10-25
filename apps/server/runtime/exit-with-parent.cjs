// Preloaded into the sandbox service (node --require). The service is spawned with an
// IPC channel, which closes when the War Room server exits for any reason, including
// being killed by a file watcher. Exiting then prevents an orphan holding the port.
process.on("disconnect", () => process.exit(0));
