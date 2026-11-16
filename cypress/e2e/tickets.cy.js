import { TicketsPage } from '../pages/TicketsPage';
import { TicketForm } from '../pages/TicketForm';

const page = new TicketsPage();
const form = new TicketForm();

describe('HelpDesk — E2E-сценарии (Этап 4)', () => {
  beforeEach(() => {
    cy.request('POST', '/api/__reset');
  });

  it('показывает исходные заявки', () => {
    page.open();
    cy.get('[data-testid="page-title"]').should('contain', 'HelpDesk');
    page.items().should('have.length', 4);
    page.count().should('have.text', '4');
  });

  // E-01: Создание заявки через форму
  it('создает новую заявку через форму и отображает её в реестре', () => {
    cy.intercept('POST', '/api/tickets').as('createTicket');
    page.open();

    form.fill({
      title: 'Не работает проектор',
      description: 'В аудитории 305 не включается проектор через HDMI',
      category: 'hardware',
      priority: 'high'
    });
    form.submit();

    cy.wait('@createTicket').its('response.statusCode').should('eq', 201);
    form.message().should('contain', 'Заявка №5 создана');
    page.items().should('have.length', 5);
    page.count().should('have.text', '5');
    page.ticketByTitle('Не работает проектор').should('contain', 'Новая');
  });

  // E-02: Поиск без учета регистра и комбинированная фильтрация
  it('находит заявку по подстроке в нижнем регистре в сочетании со статусом и категорией', () => {
    page.open();

    cy.intercept('GET', '/api/tickets*').as('filterTickets');
    page.setCategory('network');
    page.setStatus('new');
    page.searchFor('vpn');

    cy.wait('@filterTickets');
    page.items().should('have.length', 1);
    page.count().should('have.text', '1');
    page.items().first().should('contain', 'VPN недоступен');
  });

  // E-03: Жизненный цикл статуса через интерфейс (new -> in_progress -> resolved)
  it('переводит заявку в работу и затем завершает её через кнопки в карточке', () => {
    cy.intercept('PATCH', '/api/tickets/*/status').as('patchStatus');
    page.open();

    page.ticketByTitle('VPN недоступен').should('contain', 'Новая');

    // Перевод из new в in_progress
    page.advanceStatusFor('VPN недоступен');
    cy.wait('@patchStatus').its('response.statusCode').should('eq', 200);
    page.ticketByTitle('VPN недоступен').should('contain', 'В работе');

    // Перевод из in_progress в resolved
    page.advanceStatusFor('VPN недоступен');
    cy.wait('@patchStatus').its('response.statusCode').should('eq', 200);
    page.ticketByTitle('VPN недоступен')
      .should('contain', 'Завершена')
      .find('button[data-id]')
      .should('not.exist');
  });

  // E-04: Безопасный вывод данных (защита от XSS)
  it('отображает HTML-разметку в теме и описании как обычный текст без интерпретации браузером', () => {
    cy.intercept('POST', '/api/tickets').as('createTicket');
    page.open();

    const xssTitle = '<b class="injected-xss">Тест XSS</b>';
    const xssDesc = '<i class="injected-xss">Описание с тегами разметки</i>';

    form.fill({
      title: xssTitle,
      description: xssDesc,
      category: 'software',
      priority: 'low'
    });
    form.submit();

    cy.wait('@createTicket').its('response.statusCode').should('eq', 201);

    // Текст должен отображаться буквально с угловыми скобками, а внутри карточки не должно появиться тегов .injected-xss
    page.ticketByTitle(xssTitle).within(() => {
      cy.get('.ticket-title').should('have.text', xssTitle);
      cy.get('.ticket-description').should('have.text', xssDesc);
      cy.get('.injected-xss').should('not.exist');
    });
  });
});