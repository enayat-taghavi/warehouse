import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Feeding } from './feeding';

describe('Feeding', () => {
  let component: Feeding;
  let fixture: ComponentFixture<Feeding>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Feeding],
    }).compileComponents();

    fixture = TestBed.createComponent(Feeding);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
