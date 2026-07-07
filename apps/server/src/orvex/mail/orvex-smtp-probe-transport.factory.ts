import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export const ORVEX_SMTP_PROBE_TRANSPORT_FACTORY =
  'ORVEX_SMTP_PROBE_TRANSPORT_FACTORY';

export interface SmtpProbeTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  ignoreTLS?: boolean;
  auth?: { user: string; pass: string };
}

export interface SmtpProbeTransportFactory {
  create(config: SmtpProbeTransportConfig): Transporter;
}

/**
 * Transient, per-request SMTP transport (CS §4f / ❌8) built from the
 * CURRENT config for a single test send — never persisted as a config
 * mutation. This is the only production implementation; tests substitute a
 * factory backed by nodemailer's `streamTransport` (a real nodemailer
 * transport, not a hand-authored fake) — SMTP is true-external.
 */
@Injectable()
export class RealSmtpProbeTransportFactory implements SmtpProbeTransportFactory {
  create(config: SmtpProbeTransportConfig): Transporter {
    return nodemailer.createTransport(config);
  }
}
