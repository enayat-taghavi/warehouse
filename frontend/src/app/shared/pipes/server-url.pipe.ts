import { Pipe, PipeTransform } from '@angular/core';
import { resolveServerUrl } from '../../core/platform/server-origin';

/**
 * Pure pipe resolving server URLs (e.g. /media/...) with the active server origin on native mobile.
 * Returns the input unchanged on web, for empty/non-string values, or for blob:/absolute URLs.
 */
@Pipe({
  name: 'serverUrl',
  standalone: true,
  pure: true
})
export class ServerUrlPipe implements PipeTransform {
  transform(value: string | null | undefined): string | null | undefined {
    if (!value || typeof value !== 'string') {
      return value;
    }
    return resolveServerUrl(value);
  }
}
