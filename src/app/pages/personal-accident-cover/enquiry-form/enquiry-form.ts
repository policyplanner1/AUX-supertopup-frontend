import { Component } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../../shared/components/header/header';
import { FooterComponent } from '../../../shared/components/footer/footer';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-pa-enquiry',
  standalone: true,
  templateUrl: './enquiry-form.html',
  styleUrls: ['./enquiry-form.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    HeaderComponent,
    FooterComponent,
  ],
})
export class PAEnquiryFormComponent {

  step = 1;
  gender: 'Male' | 'Female' = 'Male';
  maleIcon = 'assets/you.svg';
  femaleIcon = 'assets/spouse.svg';
  youIcon = this.maleIcon;

  // Main form
  basicForm!: FormGroup;

  // Flags
  basicSubmitAttempt = false;
  riskSubmitAttempt = false;

  dobError = false;
  riskError = false;

  // Risk popup
  showRiskPopup = false;
  activeRiskTab = 0;
  selectedRiskCategory: string | null = null;

  riskTabs = ['Category 1', 'Category 2', 'Category 3'];

  riskList: any = {
    1: ['Doctors','Lawyers','Accountants','Architects/Consulting engineers','Teachers','Bankers','Clerical/administrative functions','BFSI professional','Businessman not working on factory floors','Homemaker','Student'],
    2: ['Builders/Contractors','Engineers on site','Veterinary Doctors', 'Mechanics','Manual labourers not working in mines, explosive industry, electrical intallations and such hazardous industries','Business working on factory floors'],
    3: ['Working in mines/explosives','Electrical installations','Racer','Circus artist or engaged in such other occupation','Engaged full time/ part time in any adventurous activities','Professional sportsperson','Professional adventurer/trekker/mountaineer','Defense services', 'Drivers'],
  };

  constructor(private fb: FormBuilder, private router: Router) {
    this.basicForm = this.fb.group({
      // Step-2 fields
      firstName: ['', [Validators.required, Validators.pattern(/^[A-Za-z ]+$/)]],
      lastName: ['', [Validators.required, Validators.pattern(/^[A-Za-z ]+$/)]],
      dob: ['', Validators.required],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      city: ['', [Validators.required, Validators.pattern(/^[A-Za-z ]+$/)]],

      // Step-3 fields
      occupation: ['', Validators.required],
      incomeRange: ['', Validators.required],
      coverAmount: ['', Validators.required],
    });

    this.applyGenderIcons();
  }
  goBack() {
  window.history.back();
}

  /** Auto-uppercase entire name + remove invalid chars */
onNameInput(controlName: string) {
  const ctrl = this.basicForm.get(controlName);
  if (!ctrl) return;

  let raw = (ctrl.value || '') as string;

  // Keep only letters + spaces
  raw = raw.replace(/[^A-Za-z ]/g, '');

  // Convert entire string to uppercase
  const formatted = raw.toUpperCase();

  if (formatted !== raw) {
    ctrl.setValue(formatted, { emitEvent: false });
  }
}


  // Gender change
  setGender(g: 'Male' | 'Female') {
    this.gender = g;
    this.applyGenderIcons();
  }
  applyGenderIcons() {
    this.youIcon = this.gender === 'Male' ? this.maleIcon : this.femaleIcon;
  }

  // Helpers
  get f() {
    return this.basicForm.controls;
  }

  // Prevent digits in name/city
  allowOnlyLetters(event: KeyboardEvent) {
    if (!/^[A-Za-z ]$/.test(event.key))
      event.preventDefault();
  }

  // Prevent letters in mobile/pincode
  allowOnlyDigits(event: KeyboardEvent) {
    if (!/^\d$/.test(event.key))
      event.preventDefault();
  }

  // DOB Validation
 validateDOB() {
  const dob = this.basicForm.get('dob')?.value;

  // If blank → show error
  if (!dob) {
    this.dobError = true;
    return;
  }

  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();

  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  this.dobError = age < 18;
}


  // Field invalid checker (NO default errors)
isInvalid(field: string) {
  const control = this.basicForm.get(field);
  return control?.invalid && control?.touched;  // NO DIRTY CHECK
}

  // ===========================
  // RISK POPUP LOGIC
  // ===========================
  openRiskPopup() { this.showRiskPopup = true; }
  closeRiskPopup() { this.showRiskPopup = false; }

  selectRisk(item: string) {
    this.selectedRiskCategory = item;
    this.riskError = false; // Remove error after choosing
    this.showRiskPopup = false;
  }

  // ===========================
  // NEXT BUTTON LOGIC
  // ===========================
 next() {

  // ---------------- Step 1 ----------------
  if (this.step === 1) {
    this.step = 2;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // ---------------- Step 2 ----------------
 if (this.step === 2) {

  // Mark only Step-2 fields touched
  ['firstName','lastName','dob','mobile','pincode','city']
    .forEach(field => this.basicForm.get(field)?.markAsTouched());

  this.validateDOB();

  if (this.dobError) return;

  if (
    this.basicForm.get('firstName')?.invalid ||
    this.basicForm.get('lastName')?.invalid ||
    this.basicForm.get('mobile')?.invalid ||
    this.basicForm.get('pincode')?.invalid ||
    this.basicForm.get('city')?.invalid
  ) {
    return;
  }

  // Move to STEP-3
  this.step = 3;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return;
}


  // ---------------- Step 3 ----------------

if (this.step === 3) {

  // Do NOT mark all fields touched here
  // this.basicForm.markAllAsTouched(); ❌ REMOVE THIS

  // Validate only when user tries submitting
  const s3Fields = ['occupation','incomeRange','coverAmount'];

  let hasError = false;

  s3Fields.forEach(field => {
    const control = this.basicForm.get(field);
    if (control?.invalid) {
      control.markAsTouched();
      hasError = true;
    }
  });

  // Risk category
  if (!this.selectedRiskCategory) {
    this.riskError = true;
    hasError = true;
  }

  if (hasError) return;


  const payload = {
    members: [{ id: 'you', gender: this.gender }],
    details: {
      ...this.basicForm.value,
      riskCategory: this.activeRiskTab,
    },
  };

  localStorage.setItem('pa_enquiry', JSON.stringify(payload));
  this.router.navigate(['/personal-accident/quotes']);
  }
}

prev() {
    if (this.step > 1) {
      this.step--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
