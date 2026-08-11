import { describe, expect, it } from 'vitest';

import { findMatchingHorseIds, parseStatement, type PdfTextItem } from './statement-parser';

const item = (text: string, x: number, y: number): PdfTextItem => ({ text, x, y });

describe('statement PDF parser', () => {
  it('parses the supported Lord statement layout', () => {
    const parsed = parseStatement([
      item('2026年07月20日', 390, 788),
      item('合計請求金額', 421, 720),
      item('6,950 円', 520, 720),
      item('2026年08月03日 振替口座', 420, 691),
      item('2026年06月分', 36, 641),
      item('出資馬名', 90, 606),
      item('テストホースA', 36, 584),
      item('1,400', 307, 584),
      item('1,400', 534, 584),
      item('テストホースB', 36, 573),
      item('1,400', 307, 573),
      item('1,400', 534, 573),
      item('テストホースC', 36, 562),
      item('1,400', 307, 562),
      item('1,400', 534, 562),
      item('会費（６月）', 36, 550),
      item('2,500', 421, 550),
      item('250', 484, 550),
      item('2,750', 534, 550),
      item('合計', 36, 102),
      item('6,950', 534, 102),
      item('株式会社ロードサラブレッドオーナーズ', 36, 50),
    ]);

    expect(parsed.sourceType).toBe('lord');
    expect(parsed.targetMonth).toBe('2026-06');
    expect(parsed.effectiveOn).toBe('2026-08-03');
    expect(parsed.expectedExpenseYen).toBe(6_950);
    expect(parsed.items).toHaveLength(5);
    expect(parsed.items.reduce((sum, row) => sum + row.amountYen, 0)).toBe(6_950);
  });

  it('parses the supported Silk statement layout', () => {
    const parsed = parseStatement([
      item('発行日', 410, 843),
      item('2026年', 465, 843),
      item('07月', 500, 843),
      item('09日', 530, 843),
      item('有限会社シルク・ホースクラブ', 360, 801),
      item('【2026年6月分】', 50, 645),
      item('7月27日のご精算金額', 421, 628),
      item('収入額', 115, 624),
      item('支出額', 283, 624),
      item('0', 125, 600),
      item('3,300', 283, 600),
      item('日付', 76, 504),
      item('摘要', 278, 504),
      item('金額（円）', 479, 504),
      item('2026/6/1', 88, 487),
      item('一般会費（2026年6月）', 129, 487),
      item('3,000', 525, 487),
      item('課税対象額', 335, 469),
      item('消費税', 453, 469),
      item('300', 528, 469),
      item('馬名', 227, 385),
      item('分配金額（円）', 369, 385),
      item('ご請求金額（円）', 467, 385),
      item('合計', 324, 45),
      item('0', 439, 45),
      item('0', 541, 45),
    ]);

    expect(parsed.sourceType).toBe('silk');
    expect(parsed.targetMonth).toBe('2026-06');
    expect(parsed.effectiveOn).toBe('2026-07-27');
    expect(parsed.expectedExpenseYen).toBe(3_300);
    expect(parsed.items.map((row) => row.amountYen)).toEqual([3_000, 300]);
  });

  it('matches current and former names but leaves ambiguous matches unresolved', () => {
    const horses = [
      { id: 1, name: '正式馬名', aliases: ["募集馬'24"] },
      { id: 2, name: '別の馬', aliases: ["募集馬'24"] },
    ];
    expect(findMatchingHorseIds('正式馬名', horses)).toEqual([1]);
    expect(findMatchingHorseIds("募集馬'24", horses)).toEqual([1, 2]);
  });
});
