import { IsEmail, IsNotEmpty } from 'class-validator';

/** Body for `POST /api/integrations/mail/test` (AC6/AC7). */
export class MailTestDto {
  @IsNotEmpty()
  @IsEmail()
  recipient: string;
}
