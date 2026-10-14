import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Placeholders } from './placeholders';

describe('Placeholders', () => {
  let component: Placeholders;
  let fixture: ComponentFixture<Placeholders>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Placeholders],
    }).compileComponents();

    fixture = TestBed.createComponent(Placeholders);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
