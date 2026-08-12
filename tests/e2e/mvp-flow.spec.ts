import { expect, test } from '@playwright/test';

test('registers, completes setup, and records a horse and cashflow', async ({ page, request }) => {
  const unique = Date.now();
  const email = `e2e-${unique}@example.test`;
  const horseName = `テストホース${unique}`;

  await expect
    .poll(async () => (await request.get('/api/health')).ok(), { timeout: 30_000 })
    .toBe(true);

  await page.goto('/login');
  await page.getByRole('button', { name: '新規登録' }).click();
  await page.getByLabel('表示名').fill('E2E利用者');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード（12文字以上）').fill('safe-test-password-123');
  await page.locator('form').getByRole('button', { name: '新規登録' }).click();

  await expect(page.getByRole('heading', { name: '最初の予算を設定しましょう' })).toBeVisible();
  await page.getByRole('button', { name: '設定を保存して開始' }).click();
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  await page.getByRole('link', { name: '出資検討' }).click();
  await page.getByRole('button', { name: '候補馬を登録' }).click();
  await page.getByLabel('馬名').fill(horseName);
  await page.getByLabel('一口価格（円）').fill('50000');
  await expect(page.getByText('入力額：￥50,000')).toBeVisible();
  await page.getByLabel('検討口数').fill('1');
  await page.getByRole('button', { name: '保存' }).click();
  const horseLink = page.getByRole('link', { name: horseName });
  await expect(horseLink).toBeVisible();
  const horseHref = await horseLink.getAttribute('href');
  const horseId = Number(horseHref?.split('/').at(-1));

  await horseLink.click();
  await expect(page.getByRole('heading', { name: horseName })).toBeVisible();
  await page.getByRole('button', { name: '出資と支出を登録' }).click();
  await expect(page.getByText('出資条件')).toBeVisible();
  await page.getByRole('link', { name: '出資馬管理' }).click();
  const investedCard = page.locator('article').filter({ hasText: horseName });
  await expect(investedCard).toContainText('一口価格');
  await expect(investedCard).toContainText('￥50,000');
  await expect(investedCard).toContainText('出資金合計');

  await page.getByRole('link', { name: '収支管理' }).click();
  await page.getByRole('button', { name: '収支を登録' }).click();
  await page.getByLabel('内容').fill('月次維持費');
  await page.getByLabel('金額（円）').fill('3500');
  await page.getByLabel('カテゴリー').selectOption({ label: '維持費（支出）' });
  await page.getByRole('button', { name: '確定して保存' }).click();
  await expect(page.getByRole('cell', { name: '月次維持費', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'ログアウト' }).click();
  await page.getByRole('button', { name: '新規登録' }).click();
  await page.getByLabel('表示名').fill('2人目のE2E利用者');
  await page.getByLabel('メールアドレス').fill(`second-${email}`);
  await page.getByLabel('パスワード（12文字以上）').fill('safe-test-password-456');
  await page.locator('form').getByRole('button', { name: '新規登録' }).click();
  await page.getByRole('button', { name: '設定を保存して開始' }).click();
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  const forbiddenHorse = await page.context().request.get(`/api/horses/${horseId}`);
  expect(forbiddenHorse.status()).toBe(404);
  const forbiddenDelete = await page.context().request.delete(`/api/horses/${horseId}`, {
    data: { confirmationName: horseName },
  });
  expect(forbiddenDelete.status()).toBe(404);

  const categories = await page.context().request.get('/api/categories');
  const categoryBody = (await categories.json()) as {
    data: Array<{ id: number; systemCode: string | null }>;
  };
  const maintenanceId = categoryBody.data.find((item) => item.systemCode === 'maintenance')?.id;
  expect(maintenanceId).toBeTruthy();
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
  await page.context().request.post('/api/recurring-rules', {
    data: {
      horseId: null,
      clubId: null,
      categoryId: maintenanceId,
      direction: 'expense',
      title: '冪等性確認用維持費',
      amountYen: 1000,
      frequency: 'monthly',
      dayOfMonth: 31,
      startMonth: month,
      endMonth: null,
      note: null,
    },
  });
  const firstGeneration = await page.context().request.post('/api/recurring-rules/generate', {
    data: {},
  });
  expect(firstGeneration.ok()).toBe(true);
  const firstSchedules = (await (
    await page.context().request.get('/api/scheduled-cashflows?pageSize=100')
  ).json()) as { data: unknown[] };
  const secondGeneration = await page.context().request.post('/api/recurring-rules/generate', {
    data: {},
  });
  expect(secondGeneration.ok()).toBe(true);
  const secondSchedules = (await (
    await page.context().request.get('/api/scheduled-cashflows?pageSize=100')
  ).json()) as { data: unknown[] };
  expect(secondSchedules.data).toHaveLength(firstSchedules.data.length);
});

test('permanently deletes a prospect only after exact-name confirmation', async ({ page }) => {
  const unique = Date.now();
  const email = `archive-prospect-${unique}@example.test`;
  const horseName = `削除確認馬${unique}`;

  await registerAndSetup(page, email, '削除確認利用者');
  await page.getByRole('link', { name: '出資検討' }).click();
  await page.getByRole('button', { name: '候補馬を登録' }).click();
  await page.getByLabel('馬名').fill(horseName);
  await page.getByLabel('一口価格（円）').fill('160000');
  await expect(page.getByText('入力額：￥160,000')).toBeVisible();
  await page.getByLabel('検討口数').fill('1');
  await page.getByRole('button', { name: '保存' }).click();
  const horseHref = await page.getByRole('link', { name: horseName }).getAttribute('href');
  const horseId = Number(horseHref?.split('/').at(-1));

  expect(
    (
      await page.context().request.delete(`/api/horses/${horseId}`, {
        data: { confirmationName: '' },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.context().request.delete(`/api/horses/${horseId}`, {
        data: { confirmationName: horseName, unexpected: true },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.context().request.delete(`/api/horses/${horseId}`, {
        data: { confirmationName: `${horseName}違い` },
      })
    ).status(),
  ).toBe(409);
  await expect(page.getByRole('link', { name: horseName })).toBeVisible();

  await page.getByRole('button', { name: `${horseName}を削除` }).click();
  await expect(page.getByRole('alertdialog')).toContainText(`「${horseName}」を削除しますか？`);
  await expect(page.getByRole('button', { name: '完全に削除' })).toBeDisabled();
  await page.getByLabel(`確認のため「${horseName}」と入力してください`).fill(`${horseName}違い`);
  await expect(page.getByRole('button', { name: '完全に削除' })).toBeDisabled();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('link', { name: horseName })).toBeVisible();

  await page.getByRole('button', { name: `${horseName}を削除` }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: horseName })).toBeVisible();

  await page.getByRole('button', { name: `${horseName}を削除` }).click();
  await page.getByLabel(`確認のため「${horseName}」と入力してください`).fill(horseName);
  await page.getByRole('button', { name: '完全に削除' }).click();
  await expect(page.getByRole('link', { name: horseName })).toHaveCount(0);
});

test('permanently deletes an invested horse and all horse-linked financial data', async ({
  page,
}) => {
  const unique = Date.now();
  const email = `archive-invested-${unique}@example.test`;
  const horseName = `履歴保持馬${unique}`;

  await registerAndSetup(page, email, '履歴保持確認利用者');
  await page.getByRole('link', { name: '出資検討' }).click();
  await page.getByRole('button', { name: '候補馬を登録' }).click();
  await page.getByLabel('馬名').fill(horseName);
  await page.getByLabel('一口価格（円）').fill('160000');
  await page.getByLabel('検討口数').fill('1');
  await page.getByRole('button', { name: '保存' }).click();
  const horseLink = page.getByRole('link', { name: horseName });
  const horseHref = await horseLink.getAttribute('href');
  const horseId = Number(horseHref?.split('/').at(-1));
  await horseLink.click();
  await page.getByRole('button', { name: '出資と支出を登録' }).click();
  await expect(page.getByText('出資条件')).toBeVisible();

  const categories = await page.context().request.get('/api/categories');
  const categoryBody = (await categories.json()) as {
    data: Array<{ id: number; systemCode: string | null }>;
  };
  const maintenanceId = categoryBody.data.find((item) => item.systemCode === 'maintenance')?.id;
  expect(maintenanceId).toBeTruthy();
  const startMonth = nextMonthInJapan();
  const ruleResponse = await page.context().request.post('/api/recurring-rules', {
    data: {
      horseId,
      clubId: null,
      categoryId: maintenanceId,
      direction: 'expense',
      title: `${horseName} 将来維持費`,
      amountYen: 1500,
      frequency: 'monthly',
      dayOfMonth: 1,
      startMonth,
      endMonth: null,
      note: null,
    },
  });
  expect(ruleResponse.ok()).toBe(true);

  const schedulesBefore = (await (
    await page.context().request.get('/api/scheduled-cashflows?pageSize=100')
  ).json()) as { data: Array<{ id: number; horseId: number }> };
  const scheduledId = schedulesBefore.data.find((item) => item.horseId === horseId)?.id;
  const cashflowsBefore = (await (
    await page.context().request.get(`/api/cashflows?horseId=${horseId}&pageSize=100`)
  ).json()) as { data: Array<{ id: number }> };
  expect(scheduledId).toBeTruthy();
  expect(cashflowsBefore.data[0]?.id).toBeTruthy();
  const reconciliationResponse = await page.context().request.post('/api/reconciliations', {
    data: {
      scheduledCashflowId: scheduledId,
      cashflowId: cashflowsBefore.data[0]?.id,
      reason: '完全削除テスト',
    },
  });
  expect(reconciliationResponse.ok()).toBe(true);
  const reconciliationId = ((await reconciliationResponse.json()) as { data: { id: number } }).data
    .id;

  const scenarioResponse = await page.context().request.post('/api/simulations', {
    data: {
      name: `${horseName} シミュレーション`,
      description: null,
      startMonth,
      assumedPeriodMonths: 12,
    },
  });
  expect(scenarioResponse.ok()).toBe(true);
  const scenarioId = ((await scenarioResponse.json()) as { data: { id: number } }).data.id;
  const simulationItemResponse = await page
    .context()
    .request.post(`/api/simulations/${scenarioId}/items`, {
      data: {
        horseId,
        title: horseName,
        shares: 1,
        initialAmountYen: 160000,
        monthlyAmountYen: 1500,
        annualAmountYen: 0,
        note: null,
      },
    });
  expect(simulationItemResponse.ok()).toBe(true);
  const settlementResponse = await page
    .context()
    .request.post(`/api/horses/${horseId}/settlements`, {
      data: {
        settlementType: 'retirement_settlement',
        direction: 'income',
        amountYen: 10000,
        plannedOn: null,
        note: null,
      },
    });
  expect(settlementResponse.ok()).toBe(true);

  await page.getByRole('button', { name: '削除', exact: true }).click();
  await page.getByLabel(`確認のため「${horseName}」と入力してください`).fill(horseName);
  await page.getByRole('button', { name: '完全に削除' }).click();
  await expect(page).toHaveURL(/\/horses$/);
  await expect(page.getByRole('link', { name: horseName })).toHaveCount(0);

  const cashflows = (await (
    await page.context().request.get(`/api/cashflows?horseId=${horseId}&pageSize=100`)
  ).json()) as { data: Array<{ status: string; amountYen: number }> };
  expect(cashflows.data).toHaveLength(0);

  const investments = (await (
    await page.context().request.get(`/api/investments?horseId=${horseId}`)
  ).json()) as { data: unknown[] };
  expect(investments.data).toHaveLength(0);

  const rules = (await (
    await page.context().request.get('/api/recurring-rules?pageSize=100')
  ).json()) as { data: Array<{ horseId: number }> };
  expect(rules.data.some((rule) => rule.horseId === horseId)).toBe(false);

  const schedules = (await (
    await page.context().request.get('/api/scheduled-cashflows?pageSize=100')
  ).json()) as { data: Array<{ horseId: number; status: string }> };
  const horseSchedules = schedules.data.filter((schedule) => schedule.horseId === horseId);
  expect(horseSchedules).toHaveLength(0);

  const reconciliations = (await (
    await page.context().request.get('/api/reconciliations?pageSize=100')
  ).json()) as { data: Array<{ id: number }> };
  expect(reconciliations.data.some((item) => item.id === reconciliationId)).toBe(false);

  const retainedScenario = (await (
    await page.context().request.get(`/api/simulations/${scenarioId}`)
  ).json()) as { data: { items: Array<{ horseId: number | null }> } };
  expect(retainedScenario.data.items.some((item) => item.horseId === horseId)).toBe(false);

  const deletedHorse = await page.context().request.get(`/api/horses/${horseId}`);
  expect(deletedHorse.status()).toBe(404);
});

test('edits a horse, completes one settlement, and can match then unlink a schedule', async ({
  page,
}) => {
  const unique = Date.now();
  const email = `stability-${unique}@example.test`;
  const originalName = `安定化確認馬${unique}`;
  const updatedName = `${originalName}改`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const month = today.slice(0, 7);
  await registerAndSetup(page, email, '安定化確認利用者');

  const categoriesResponse = await page.context().request.get('/api/categories');
  const categories = (await categoriesResponse.json()) as {
    data: Array<{ id: number; categoryType: 'expense' | 'income' }>;
  };
  const expenseCategoryId = categories.data.find((item) => item.categoryType === 'expense')?.id;
  const incomeCategoryId = categories.data.find((item) => item.categoryType === 'income')?.id;
  expect(expenseCategoryId).toBeTruthy();
  expect(incomeCategoryId).toBeTruthy();

  const horseResponse = await page.context().request.post('/api/horses', {
    data: { name: originalName, clubId: null, status: 'retired' },
  });
  const horse = (await horseResponse.json()) as { data: { id: number } };
  expect(horseResponse.status()).toBe(201);
  await page.goto(`/horses/${horse.data.id}`);
  await page.getByRole('button', { name: '馬名を編集' }).click();
  const editDialog = page.getByRole('alertdialog', { name: '馬名を編集' });
  await editDialog.getByLabel('馬名', { exact: true }).fill(updatedName);
  await editDialog.getByRole('button', { name: '名前を保存' }).click();
  await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

  const settlementResponse = await page
    .context()
    .request.post(`/api/horses/${horse.data.id}/settlements`, {
      data: {
        settlementType: 'sale_proceeds',
        direction: 'income',
        amountYen: 25_000,
        plannedOn: today,
        note: null,
      },
    });
  const settlement = (await settlementResponse.json()) as { data: { id: number } };
  await page.reload();
  await page.getByRole('button', { name: '受領済みにする' }).click();
  await expect(page.getByText(/受領済み/u)).toBeVisible();
  await expect(page.getByText(new RegExp(`完了日 ${today}・作成した収支 #`, 'u'))).toBeVisible();
  const repeatedSettlement = await page
    .context()
    .request.post(`/api/settlements/${settlement.data.id}/complete`, {
      data: { settledOn: today, categoryId: incomeCategoryId },
    });
  expect(repeatedSettlement.status()).toBe(409);

  const scheduledResponse = await page.context().request.post('/api/scheduled-cashflows', {
    data: {
      horseId: horse.data.id,
      clubId: null,
      categoryId: expenseCategoryId,
      direction: 'expense',
      title: '照合予定',
      amountYen: 5000,
      dueOn: today,
      targetMonth: month,
      note: null,
    },
  });
  const scheduled = (await scheduledResponse.json()) as { data: { id: number } };
  const actualResponse = await page.context().request.post('/api/cashflows', {
    data: {
      horseId: horse.data.id,
      clubId: null,
      categoryId: expenseCategoryId,
      direction: 'expense',
      title: '照合実績',
      amountYen: 5000,
      occurredOn: today,
      targetMonth: month,
      paymentMethod: null,
      note: null,
    },
  });
  expect(actualResponse.status()).toBe(201);

  await page.goto('/scheduled');
  await expect(page.getByText('今月の未照合候補')).toBeVisible();
  await page.getByRole('button', { name: 'この組み合わせで照合' }).click();
  await expect(page.getByRole('button', { name: '照合を解除' })).toBeVisible();
  await page.getByRole('button', { name: '照合を解除' }).click();
  await expect(page.getByRole('button', { name: '照合を解除' })).toHaveCount(0);
  const schedules = (await (
    await page.context().request.get(`/api/scheduled-cashflows?targetMonth=${month}&pageSize=100`)
  ).json()) as { data: Array<{ id: number; status: string }> };
  expect(schedules.data.find((item) => item.id === scheduled.data.id)?.status).toBe('planned');
});

async function registerAndSetup(
  page: import('@playwright/test').Page,
  email: string,
  name: string,
) {
  await page.goto('/login');
  await page.getByRole('button', { name: '新規登録' }).click();
  await page.getByLabel('表示名').fill(name);
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード（12文字以上）').fill('safe-test-password-789');
  await page.locator('form').getByRole('button', { name: '新規登録' }).click();
  await page.getByRole('button', { name: '設定を保存して開始' }).click();
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
}

function nextMonthInJapan(): string {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
  const [year, month] = currentMonth.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year!, month!, 1));
  return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}`;
}
