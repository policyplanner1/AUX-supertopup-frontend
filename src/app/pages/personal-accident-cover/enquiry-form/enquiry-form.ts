import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../../shared/components/header/header';
import { FooterComponent } from '../../../shared/components/footer/footer';

import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';

@Component({
  selector: 'app-pa-enquiry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    HeaderComponent,
    FooterComponent,
  ],
  templateUrl: './enquiry-form.html',
  styleUrl: './enquiry-form.scss',
})
export class PAEnquiryFormComponent {

  /* ============================================================
     STEPPER
  ============================================================ */
  step = 1;

  /* ============================================================
     GENDER & ICONS — SAME LOGIC AS SUPERTOPUP
  ============================================================ */
  gender: 'Male' | 'Female' = 'Male';

  maleIcon = 'assets/you.svg';
  femaleIcon = 'assets/spouse.svg';

  youIcon = this.maleIcon; // default male icon

  /* ============================================================
     AGE DROPDOWN
  ============================================================ */
  openAgeDropdownId: string | null = null;
  selectedAges: Record<string, string> = { you: '' };

  ageOptions: { value: string; label: string }[] = [];

  /* ============================================================
     BASIC DETAILS FORM (INCLUDES ANNUAL INCOME)
  ============================================================ */
  basicForm: FormGroup;
  basicFormSubmitAttempted = false;

  constructor(private fb: FormBuilder, private router: Router) {
    this.basicForm = this.fb.group({
      firstName: [
        '',
        [
          Validators.required,
          Validators.maxLength(20),
          Validators.pattern(/^[A-Za-z ]+$/),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.maxLength(20),
          Validators.pattern(/^[A-Za-z ]+$/),
        ],
      ],
      mobile: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[6-9]\d{9}$/),
        ],
      ],
      pincode: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d{6}$/),
        ],
      ],
      city: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[A-Za-z ]+$/),
          Validators.minLength(3),
        ],
      ],
      coverAmount: ['', Validators.required],

      /* ⭐ NEW FIELD */
      annualIncome: ['', Validators.required],
    });

    this.createAgeOptions();
    this.applyGenderIcons();
  }

  /* ============================================================
     AGE OPTIONS (18 to 70)
  ============================================================ */
  createAgeOptions() {
    this.ageOptions = [];
    for (let a = 18; a <= 70; a++) {
      this.ageOptions.push({ value: String(a), label: `${a} Years` });
    }
  }

  /* ============================================================
     GENDER LOGIC (SAME AS SUPERTOPUP)
  ============================================================ */
  setGender(g: 'Male' | 'Female') {
    this.gender = g;
    this.applyGenderIcons();
  }

  applyGenderIcons() {
    this.youIcon = this.gender === 'Male' ? this.maleIcon : this.femaleIcon;
  }

  /* ============================================================
     AGE DROPDOWN — SAME AS SUPERTOPUP
  ============================================================ */
  toggleAgeDropdown(id: string) {
    this.openAgeDropdownId = this.openAgeDropdownId === id ? null : id;
  }

  selectAge(id: string, value: string | null) {
    this.selectedAges[id] = value ?? '';
    this.openAgeDropdownId = null;
  }

  getAgeLabel(id: string): string {
    const v = this.selectedAges[id];
    return v ? `${v} Years` : 'Select Age';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.age-dropdown')) {
      this.openAgeDropdownId = null;
    }
  }

  /* ============================================================
     VALIDATION HELPERS (EXACT LIKE SUPERTOPUP)
  ============================================================ */
  get f() {
    return this.basicForm.controls;
  }

  isInvalid(controlName: string): boolean {
    const ctrl = this.basicForm.get(controlName);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched || this.basicFormSubmitAttempted);
  }

  allowOnlyLetters(event: KeyboardEvent) {
    const key = event.key;
    if (
      key === 'Backspace' ||
      key === 'Tab' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'Delete'
    ) {
      return;
    }
    if (!/^[A-Za-z ]$/.test(key)) {
      event.preventDefault();
    }
  }

  allowOnlyDigits(event: KeyboardEvent) {
    const key = event.key;
    if (
      key === 'Backspace' ||
      key === 'Tab' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'Delete'
    ) {
      return;
    }
    if (!/^\d$/.test(key)) {
      event.preventDefault();
    }
  }

  /* ============================================================
     STEPPER NAVIGATION (MATCHES SUPERTOPUP STRUCTURE)
  ============================================================ */
  next() {
    if (this.step === 1) {
      this.step = 2;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (this.step === 2) {
      if (!this.selectedAges['you']) {
        alert('Please select your age.');
        return;
      }
      this.step = 3;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (this.step === 3) {
      this.basicFormSubmitAttempted = true;
      if (this.basicForm.invalid) {
        this.basicForm.markAllAsTouched();
        return;
      }

      const payload = this.finalPayload();
      localStorage.setItem('pa_enquiry', JSON.stringify(payload));

      this.router.navigate(['/personal-accident/quotes']);
    }
  }

  prev() {
    if (this.step > 1) this.step--;
  }

  /* ============================================================
     FINAL PAYLOAD (SAME FORMAT AS SUPERTOPUP)
  ============================================================ */
  finalPayload() {
    return {
      members: [
        {
          id: 'you',
          age: this.selectedAges['you'],
          gender: this.gender,
        },
      ],
      details: this.basicForm.value,
    };
  }
}
