import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Dispatch } from './dispatch';

describe('Dispatch', () => {
  let component: Dispatch;
  let fixture: ComponentFixture<Dispatch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dispatch],
    }).compileComponents();

    fixture = TestBed.createComponent(Dispatch);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
