import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AllFeatures } from './all-features';

describe('AllFeatures', () => {
  let component: AllFeatures;
  let fixture: ComponentFixture<AllFeatures>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllFeatures]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AllFeatures);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
