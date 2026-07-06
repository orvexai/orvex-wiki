import { Body, Controller, Post } from '@nestjs/common';

import { OrvexNotImplementedException } from '../not-implemented';
import { SessionExchangeRequestDto } from './dto/session-exchange.dto';

/**
 * FR-W6 / A-AUTH — consume an identity-minted RS256 exchange token and mint an
 * engine session. Public (the entry that ESTABLISHES the session cannot itself
 * require one).
 *
 * DELIBERATELY narrowed noop-501: the RS256/JWKS verification CORE is already
 * built + tested (M7 `session-mint`). Only WIRING the verified claims into the
 * upstream Docmost session flow is an A-THIN allow-listed fold-in sequenced for
 * delivery — so the endpoint throws the typed sentinel rather than minting a
 * fabricated session.
 */
@Controller('orvex/session')
export class OrvexSessionController {
  @Post('exchange')
  exchange(@Body() _body: SessionExchangeRequestDto): never {
    // ORVEX_NOT_IMPLEMENTED: orvexSessionExchange
    throw new OrvexNotImplementedException('orvexSessionExchange');
  }
}
