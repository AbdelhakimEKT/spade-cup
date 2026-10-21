import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundPage } from './not-found-page';

describe('NotFoundPage', () => {
  it('affiche le contenu attendu', async () => {
    TestBed.configureTestingModule({ imports: [NotFoundPage], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFoundPage);

    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Retour à l'accueil");
  });
});
