/** Backend entry point. */
import { Logger } from '@nestjs/common';

import { API_PREFIX, createApp } from './bootstrap.js';

async function main(): Promise<void> {
  const { app, config } = await createApp();
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `listening on port ${String(config.port)}, API at /${API_PREFIX}; machine ${config.machineConfigPath}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
