export class TicketsPage {
  open() {
    cy.visit('/');
  }

  items() {
    return cy.get('[data-testid="ticket-item"]');
  }

  count() {
    return cy.get('[data-testid="ticket-count"]');
  }

  searchFor(text) {
    cy.get('[data-testid="search"]').clear().type(text);
  }

  setStatus(status) {
    cy.get('[data-testid="status-filter"]').select(status);
  }

  setCategory(category) {
    cy.get('[data-testid="category-filter"]').select(category);
  }

  ticketByTitle(title) {
    return this.items().contains('.ticket-title', title).closest('[data-testid="ticket-item"]');
  }

  advanceStatusFor(title) {
    this.ticketByTitle(title).find('button[data-id]').click();
  }
}