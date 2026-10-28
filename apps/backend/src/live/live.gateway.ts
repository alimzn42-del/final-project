/**
 * The live push to the web app: socket.io at LIVE_PATH (plan step 10).
 *
 * Access is the same as /api/telemetry: managers and workers only. It is
 * checked when the connection opens (session cookie, user re-read from the
 * database, like AccessGuard), and again every minute: a connection stays
 * open for hours, so a deleted user, a changed role, a reset password or an
 * expired session must still be cut off.
 *
 * Server -> client only (docs/04-architecture.md):
 * - `snapshot` once on connect: every latest reading and every state;
 * - `readings` every 0.5 s: only the sensors that sent something new;
 * - `states` when a state changes (checked every second): only the changes.
 * Every staff client gets everything (about 2 KB per batch for 60 sensors).
 * Rooms per section can be added later if the Pi's bandwidth needs it.
 */
import {
  type LatestReading,
  LIVE_EVENTS,
  LIVE_PATH,
  LIVE_REFUSALS,
  type LiveReadings,
  type LiveRefusal,
  type LiveServerEvents,
  type Role,
} from '@mixline/shared';
import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type OnGatewayConnection, type OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';

import { readCookie, SESSION_COOKIE, Sessions } from '../auth/session.js';
import { StateService } from '../state/state.service.js';
import { TelemetryIngest } from '../telemetry/ingest.js';
import { USER_STORE, type UserStore } from '../users/user-store.js';

export const READINGS_EVERY_MS = 500;
export const RECHECK_EVERY_MS = 60_000;

const STAFF: readonly Role[] = ['manager', 'worker'];

/** Kept per connection: the session token, to check it again later. */
interface LiveData {
  token: string | undefined;
}

type LiveServer = Server<DefaultEventsMap, LiveServerEvents, DefaultEventsMap, LiveData>;
type LiveSocket = Socket<DefaultEventsMap, LiveServerEvents, DefaultEventsMap, LiveData>;

@WebSocketGateway({ path: LIVE_PATH, serveClient: false })
export class LiveGateway
  implements OnGatewayInit<LiveServer>, OnGatewayConnection<LiveSocket>, OnModuleDestroy
{
  private readonly logger = new Logger('Live');
  private server: LiveServer | undefined;
  /** The last reading pushed for each sensor, so a batch holds only what is new. */
  private readonly sent = new Map<string, LatestReading>();
  private readonly timers: NodeJS.Timeout[] = [];
  private stopStates: (() => void) | undefined;

  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(Sessions) private readonly sessions: Sessions,
    @Inject(TelemetryIngest) private readonly ingest: TelemetryIngest,
    @Inject(StateService) private readonly state: StateService,
  ) {}

  afterInit(server: LiveServer): void {
    this.server = server;
    // Runs before a connection is accepted; a refusal reaches the client as connect_error.
    server.use((socket, next) => {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      this.refusal(token).then(
        (refusal) => {
          if (refusal) {
            next(new Error(refusal));
            return;
          }
          socket.data.token = token;
          next();
        },
        (error: unknown) => {
          this.logger.warn(`could not check a live login: ${String(error)}`);
          next(new Error(LIVE_REFUSALS.unavailable));
        },
      );
    });
    this.stopStates = this.state.onChange((changes) => {
      server.emit(LIVE_EVENTS.states, changes);
    });
    this.timers.push(
      setInterval(() => {
        this.pushReadings();
      }, READINGS_EVERY_MS),
      setInterval(() => {
        void this.recheck();
      }, RECHECK_EVERY_MS),
    );
  }

  /** Only accepted (staff) connections get here. */
  handleConnection(socket: LiveSocket): void {
    socket.emit(LIVE_EVENTS.snapshot, {
      readings: this.ingest.latest(),
      states: this.state.current(),
    });
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.stopStates?.();
  }

  /** Sends the readings that are new since the last batch, if any. */
  pushReadings(): void {
    if (!this.server) return;
    const fresh: LiveReadings = {};
    let count = 0;
    for (const [id, reading] of Object.entries(this.ingest.latest())) {
      if (sameReading(this.sent.get(id), reading)) continue;
      this.sent.set(id, reading);
      fresh[id] = reading;
      count++;
    }
    if (count > 0) this.server.emit(LIVE_EVENTS.readings, fresh);
  }

  /** Closes every connection whose session or account no longer allows the live view. */
  async recheck(): Promise<void> {
    if (!this.server) return;
    for (const socket of this.server.sockets.sockets.values()) {
      try {
        if (await this.refusal(socket.data.token)) socket.disconnect(true);
      } catch (error) {
        // Database down: keep the connection (it passed a check a minute ago); retry next time.
        this.logger.warn(`could not recheck a live login: ${String(error)}`);
      }
    }
  }

  /** Why this session may not use the live view; undefined if it may. */
  private async refusal(token: string | undefined): Promise<LiveRefusal | undefined> {
    const userId = await this.sessions.verify(token);
    const user = userId ? await this.users.findById(userId) : undefined;
    if (!user) return LIVE_REFUSALS.loginRequired;
    if (user.mustChangePassword) return LIVE_REFUSALS.passwordChangeRequired;
    if (!STAFF.includes(user.role)) return LIVE_REFUSALS.forbidden;
    return undefined;
  }
}

function sameReading(a: LatestReading | undefined, b: LatestReading): boolean {
  return (
    a?.receivedAt === b.receivedAt && a.ts === b.ts && a.value === b.value && a.source === b.source
  );
}
