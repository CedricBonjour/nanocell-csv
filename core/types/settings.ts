/**
 * @file core/types/settings.ts
 * Strongly-typed application settings contracts and default configurations.
 * ZERO browser/DOM imports.
 */

export type ThemeName = 'light' | 'dark' | 'solarized' | 'night' | 'nord' | 'dracula';
export type CsvDelimiterOption = ',' | ';' | 'TAB' | '|';

export interface AppSettings {
  // Appearance
  theme: ThemeName;
  font: number;
  rows: number;
  cols: number;
  actionBar: boolean;
  purple: boolean;

  // CSV Save
  encoding: string;
  delimiter: CsvDelimiterOption;
  save_fixed_width_size: number;
  save_strict: boolean;

  // CSV Open
  set_headers: boolean;
  trim: boolean;

  // Data Validation
  dv_comma_num: boolean;
  dv_comma_txt: boolean;
  dv_quotes: boolean;
  dv_lr: boolean;
  dv_lower: boolean;

  // CSV View Only
  editMaxFileSize: number;
  vo_n_chunks: number;
  vo_n_rows: number;

  // Sort
  sort_header: boolean;
  sort_num_first: boolean;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({
  theme: 'nord',
  font: 13,
  rows: 25,
  cols: 7,
  actionBar: true,
  purple: true,
  encoding: 'utf-8',
  delimiter: ',',
  save_fixed_width_size: 0,
  save_strict: false,
  set_headers: true,
  trim: false,
  dv_comma_num: true,
  dv_comma_txt: true,
  dv_quotes: true,
  dv_lr: true,
  dv_lower: false,
  editMaxFileSize: 10,
  vo_n_chunks: 5,
  vo_n_rows: 10,
  sort_header: true,
  sort_num_first: false
});
