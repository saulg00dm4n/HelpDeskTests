'use strict';

const {
  normalizeTitle,
  validateTicketInput,
  canChangeStatus,
  filterAndSort
} = require('../../src/core');

describe('Базовые unit-тесты', () => {
  test('удаляет пробелы в начале и конце темы', () => {
    expect(normalizeTitle('  Ошибка принтера  ')).toBe('Ошибка принтера');
  });

  test('отклоняет неизвестную категорию', () => {
    const errors = validateTicketInput({
      title: 'Ошибка печати',
      description: 'Принтер не печатает документ',
      category: 'unknown',
      priority: 'low'
    });
    expect(errors).toHaveProperty('category');
  });

  test('запрещает возвращение из закрытого статуса', () => {
    expect(canChangeStatus('resolved', 'new')).toBe(false);
  });
});

describe('Расширенные unit-тесты (Этап 2)', () => {
  // U-01 / U-02: Нормализация множественных и внутренних пробелов
  test('схлопывает повторяющиеся внутренние пробелы и табуляции в один пробел', () => {
    expect(normalizeTitle('  Сбой   VPN\t\nв   корпусе  ')).toBe('Сбой VPN в корпусе');
  });

  // U-03: Параметризованная проверка граничных значений длины темы после нормализации (test.each)
  // Границы выбраны по ТЗ: минимум 5 символов, максимум 80 символов после нормализации
  test.each([
    ['    ', false, '4 пробела -> 0 символов после нормализации (ниже минимума 5)'],
    ['  Тест  ', false, '4 символа после обрезки (на 1 меньше нижней границы 5)'],
    ['  Тест1  ', true, 'ровно 5 символов после нормализации (нижняя граница)'],
    ['а'.repeat(80), true, 'ровно 80 символов (верхняя граница)'],
    ['а'.repeat(81), false, '81 символ (на 1 больше верхней границы 80)']
  ])('валидация границы длины темы "%s" -> valid=%s (%s)', (rawTitle, expectedValid) => {
    const errors = validateTicketInput({
      title: rawTitle,
      description: 'Корректное описание заявки длиной более десяти символов',
      category: 'network',
      priority: 'medium'
    });
    expect(Object.keys(errors).length === 0).toBe(expectedValid);
  });

  // U-04: Граничные значения длины описания (10 и 500 символов)
  test('проверяет граничные значения длины описания (9, 10, 500, 501)', () => {
    const base = { title: 'Корректная тема', category: 'software', priority: 'low' };
    expect(validateTicketInput({ ...base, description: '123456789' })).toHaveProperty('description');
    expect(validateTicketInput({ ...base, description: '  1234567890  ' })).not.toHaveProperty('description');
    expect(validateTicketInput({ ...base, description: 'б'.repeat(500) })).not.toHaveProperty('description');
    expect(validateTicketInput({ ...base, description: 'б'.repeat(501) })).toHaveProperty('description');
  });

  // U-05: Правила переходов статусов (разрешены только new -> in_progress и in_progress -> resolved)
  test('запрещает прямой переход из new в resolved (пропуск этапа)', () => {
    expect(canChangeStatus('new', 'in_progress')).toBe(true);
    expect(canChangeStatus('in_progress', 'resolved')).toBe(true);
    expect(canChangeStatus('new', 'resolved')).toBe(false);
    expect(canChangeStatus('in_progress', 'new')).toBe(false);
  });

  // U-06: Сортировка по приоритету (high -> medium -> low) и времени создания (новые выше)
  test('сортирует заявки по убыванию приоритета, а внутри приоритета — по новизне', () => {
    const tickets = [
      { id: 1, title: 'Low', description: 'desc', category: 'network', priority: 'low', status: 'new', createdAt: '2026-10-05T10:00:00.000Z' },
      { id: 2, title: 'High old', description: 'desc', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-01T10:00:00.000Z' },
      { id: 3, title: 'Medium', description: 'desc', category: 'network', priority: 'medium', status: 'new', createdAt: '2026-10-04T10:00:00.000Z' },
      { id: 4, title: 'High new', description: 'desc', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-03T10:00:00.000Z' }
    ];

    const sorted = filterAndSort(tickets);
    expect(sorted.map((t) => t.id)).toEqual([4, 2, 3, 1]);
  });

  // U-07: Регистронезависимый поиск с обрезкой пробелов
  test('ищет подстроку без учета регистра в теме и описании', () => {
    const tickets = [
      { id: 1, title: 'VPN недоступен', description: 'Ошибка сети', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-01T10:00:00.000Z' },
      { id: 2, title: 'Принтер', description: 'Нужен картридж HP', category: 'hardware', priority: 'low', status: 'new', createdAt: '2026-10-02T10:00:00.000Z' }
    ];

    expect(filterAndSort(tickets, { search: '  vpn ' }).map((t) => t.id)).toEqual([1]);
    expect(filterAndSort(tickets, { search: 'КАРТРИДЖ' }).map((t) => t.id)).toEqual([2]);
  });
});