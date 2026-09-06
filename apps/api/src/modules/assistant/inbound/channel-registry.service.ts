import { Injectable, Logger } from '@nestjs/common';
import type { ChannelSender } from './channel.port';

/**
 * Where the transports announce themselves.
 *
 * The core cannot import a transport — that is the rule the whole module is
 * built on — but it does have to answer through one, and sometimes outside the
 * call that triggered it. So the dependency is inverted: each transport
 * registers itself at boot and the core looks it up by name.
 */
@Injectable()
export class ChannelRegistryService {
  private readonly logger = new Logger(ChannelRegistryService.name);
  private readonly senders = new Map<string, ChannelSender>();

  register(sender: ChannelSender): void {
    this.senders.set(sender.channel, sender);
    this.logger.log(`Channel "${sender.channel}" registered`);
  }

  /**
   * Throws rather than returning null. A message that reached the core came in
   * through a transport, so the absence of that transport is a wiring mistake,
   * and swallowing it would lose the user's reply silently.
   */
  get(channel: string): ChannelSender {
    const sender = this.senders.get(channel);
    if (!sender) throw new Error(`No transport registered for channel "${channel}"`);
    return sender;
  }

  has(channel: string): boolean {
    return this.senders.has(channel);
  }
}
