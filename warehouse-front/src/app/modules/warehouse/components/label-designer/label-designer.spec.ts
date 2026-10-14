import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelDesigner } from './label-designer';

describe('LabelDesigner', () => {
  let component: LabelDesigner;
  let fixture: ComponentFixture<LabelDesigner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LabelDesigner],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelDesigner);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
