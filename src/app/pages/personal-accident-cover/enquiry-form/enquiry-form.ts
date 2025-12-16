import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-pa-enquiry',
  standalone: true,
  templateUrl: './enquiry-form.html',
  styleUrls: ['./enquiry-form.scss'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
})
export class PAEnquiryFormComponent {
  step = 1;

  gender: 'Male' | 'Female' = 'Male';
  maleIcon = 'assets/you.svg';
  femaleIcon = 'assets/spouse.svg';
  youIcon = this.maleIcon;

  // ✅ SuperTopup-style restore keys (ONLY for restore behavior)
  private readonly ENQUIRY_KEY = 'pa_enquiry';
  private readonly RESTORE_FLAG = 'pa_enquiry_restore_ok';
  private readonly PAGE_KEY = 'pa_last_page';
  private readonly PAGE_NAME = 'pa-enquiry-form';

  private readonly LANDING_URL = 'https://policyplanner.com/#/';

  basicForm: FormGroup;

  // DOB flags
  dobError = false;
  dobFormatError = false;

  // Risk popup
  riskError = false;
  showRiskPopup = false;
  activeRiskTab = 0;
  selectedRiskCategory: string | null = null;

  riskTabs = ['Category 1', 'Category 2', 'Category 3'];
  riskList: Record<number, string[]> = {
    1: [
      'Doctors', 'Lawyers', 'Accountants', 'Architects/Consulting engineers', 'Teachers',
      'Bankers', 'Clerical/administrative functions', 'BFSI professional',
      'Businessman not working on factory floors', 'Homemaker', 'Student'
    ],
    2: [
      'Builders/Contractors', 'Engineers on site', 'Veterinary Doctors', 'Mechanics',
      'Manual labourers not working in mines, explosive industry, electrical intallations and such hazardous industries',
      'Business working on factory floors'
    ],
    3: [
      'Working in mines/explosives', 'Electrical installations', 'Racer',
      'Circus artist or engaged in such other occupation',
      'Engaged full time/ part time in any adventurous activities',
      'Professional sportsperson', 'Professional adventurer/trekker/mountaineer',
      'Defense services', 'Drivers'
    ],
  };

  constructor(private fb: FormBuilder, private router: Router) {
    this.basicForm = this.fb.group({
      // Step 2
      firstName: ['', [Validators.required, Validators.pattern(/^[A-Za-z ]+$/)]],
      lastName: ['', [Validators.required, Validators.pattern(/^[A-Za-z ]+$/)]],
      dob: ['', Validators.required],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      city: ['', [Validators.required, Validators.pattern(/^[A-Za-z ]+$/)]],

      // Step 3
      occupation: ['', Validators.required],
      incomeRange: ['', Validators.required],
      coverAmount: ['', Validators.required],
    });

    this.applyGenderIcons();
  }

  ngOnInit(): void {
    // ✅ Detect refresh on pa-enquiry-form ONLY -> clear everything (SuperTopup style)
    const lastPage = sessionStorage.getItem(this.PAGE_KEY);
    sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

    const isReload = this.isReloadNavigation();
    const isRealEnquiryRefresh = isReload && lastPage === this.PAGE_NAME;

    if (isRealEnquiryRefresh) {
      this.clearTempEnquiry();
      sessionStorage.removeItem(this.RESTORE_FLAG);
      this.resetToFreshJourney();
      return;
    }

    // ✅ Restore only if user came from quotes (flag set during submit)
    const restoreAllowed = sessionStorage.getItem(this.RESTORE_FLAG) === '1';
    const hasPayload = !!localStorage.getItem(this.ENQUIRY_KEY);

    if (restoreAllowed && hasPayload) {
      const restored = this.restoreFromLocal();
      if (restored) {
        this.step = 3;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      this.applyGenderIcons();
    }
  }

  // ---------------------------
  // ✅ Back Journey (same as SuperTopup)
  // ---------------------------
  goBack() {
    if (this.step > 1) {
      this.prev();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.location.href = this.LANDING_URL;
    }
  }

  prev() {
    if (this.step > 1) {
      this.step--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ---------------------------
  // Step Flow
  // ---------------------------
  async next() {
    // Step 1 -> Step 2
    if (this.step === 1) {
      this.step = 2;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Step 2 validation -> Step 3
    if (this.step === 2) {
      ['firstName', 'lastName', 'dob', 'mobile', 'pincode', 'city'].forEach((f) =>
        this.basicForm.get(f)?.markAsTouched()
      );

      this.validateDOB();

      if (this.dobFormatError || this.dobError) return;

      const s2Invalid =
        this.basicForm.get('firstName')?.invalid ||
        this.basicForm.get('lastName')?.invalid ||
        this.basicForm.get('dob')?.invalid ||
        this.basicForm.get('mobile')?.invalid ||
        this.basicForm.get('pincode')?.invalid ||
        this.basicForm.get('city')?.invalid;

      if (s2Invalid) return;

      this.step = 3;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Step 3 validation -> save -> quotes
    if (this.step === 3) {
      const s3Fields = ['occupation', 'incomeRange', 'coverAmount'];

      let hasError = false;
      s3Fields.forEach((field) => {
        const ctrl = this.basicForm.get(field);
        if (ctrl?.invalid) {
          ctrl.markAsTouched();
          hasError = true;
        }
      });

      if (!this.selectedRiskCategory) {
        this.riskError = true;
        hasError = true;
      }

      if (hasError) return;

      // ✅ Save payload to localStorage (SuperTopup style)
      const payload = this.buildPayload();
      localStorage.setItem(this.ENQUIRY_KEY, JSON.stringify(payload));

      // ✅ allow restore ONLY when coming back from quotes (same browser session)
      sessionStorage.setItem(this.RESTORE_FLAG, '1');

      // ✅ mark current page (used for refresh detection)
      sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

      this.router.navigate(['/personal-accident/quotes']);
    }
  }

  private buildPayload() {
    return {
      step: 3,
      gender: this.gender,
      details: {
        ...this.basicForm.getRawValue(),
        selectedRiskCategory: this.selectedRiskCategory,
        activeRiskTab: this.activeRiskTab,
      },
    };
  }
// ✅ Risk theme (changes automatically for Category 1/2/3)
get riskTheme() {
  const tab = Number(this.activeRiskTab || 1);
  if (tab === 2) {
    return {
      brand: "text-amber-700",
      bg: "bg-amber-50",
      ring: "ring-amber-200",
      pillActive: "bg-amber-600 text-white",
      itemActive: "bg-amber-600 text-white border-amber-600",
      itemHover: "hover:border-amber-300 hover:bg-amber-50",
      focusRing: "focus:ring-amber-200",
      chip: "bg-amber-100 text-amber-700",
    };
  }
  if (tab === 3) {
    return {
      brand: "text-rose-700",
      bg: "bg-rose-50",
      ring: "ring-rose-200",
      pillActive: "bg-rose-600 text-white",
      itemActive: "bg-rose-600 text-white border-rose-600",
      itemHover: "hover:border-rose-300 hover:bg-rose-50",
      focusRing: "focus:ring-rose-200",
      chip: "bg-rose-100 text-rose-700",
    };
  }
  // Category 1 (default)
  return {
    brand: "text-[#006D8D]",
    bg: "bg-[#EAF6FA]",
    ring: "ring-[#006D8D]/15",
    pillActive: "bg-[#006D8D] text-white",
    itemActive: "bg-[#006D8D] text-white border-[#006D8D]",
    itemHover: "hover:border-[#006D8D]/30 hover:bg-[#006D8D]/5",
    focusRing: "focus:ring-[#006D8D]/20",
    chip: "bg-[#006D8D]/10 text-[#006D8D]",
  };
}

  // ---------------------------
  // Gender / Icons
  // ---------------------------
  setGender(g: 'Male' | 'Female') {
    this.gender = g;
    this.applyGenderIcons();
  }

  applyGenderIcons() {
    this.youIcon = this.gender === 'Male' ? this.maleIcon : this.femaleIcon;
  }

  // ---------------------------
  // Input helpers
  // ---------------------------
  allowOnlyLetters(event: KeyboardEvent) {
    const key = event.key;
    if (key === 'Backspace' || key === 'Tab' || key.startsWith('Arrow') || key === 'Delete') return;
    if (!/^[A-Za-z ]$/.test(key)) event.preventDefault();
  }

  allowOnlyDigits(event: KeyboardEvent) {
    const key = event.key;
    if (key === 'Backspace' || key === 'Tab' || key.startsWith('Arrow') || key === 'Delete') return;
    if (!/^\d$/.test(key)) event.preventDefault();
  }

  onNameInput(controlName: string) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;

    let raw = (ctrl.value || '') as string;
    raw = raw.replace(/[^A-Za-z ]/g, '');
    const formatted = raw.toUpperCase();

    ctrl.setValue(formatted, { emitEvent: false });
  }

  // ---------------------------
  // DOB logic
  // ---------------------------
  onDobInput(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = input.value || '';
    value = value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);

    let formatted = '';
    if (value.length <= 2) formatted = value;
    else if (value.length <= 4) formatted = value.slice(0, 2) + '/' + value.slice(2);
    else formatted = value.slice(0, 2) + '/' + value.slice(2, 4) + '/' + value.slice(4);

    this.basicForm.get('dob')?.setValue(formatted, { emitEvent: false });
    this.dobError = false;
    this.dobFormatError = false;
  }

  validateDOB() {
    const dobStr: string = this.basicForm.get('dob')?.value;

    this.dobError = false;
    this.dobFormatError = false;

    if (!dobStr) {
      this.dobFormatError = true;
      return;
    }

    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dobStr);
    if (!match) {
      this.dobFormatError = true;
      return;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      this.dobFormatError = true;
      return;
    }

    const dobDate = new Date(year, month - 1, day);

    if (
      dobDate.getFullYear() !== year ||
      dobDate.getMonth() !== month - 1 ||
      dobDate.getDate() !== day
    ) {
      this.dobFormatError = true;
      return;
    }

    const today = new Date();
    if (dobDate > today) {
      this.dobFormatError = true;
      return;
    }

    let age = today.getFullYear() - year;
    const m = today.getMonth() - (month - 1);
    if (m < 0 || (m === 0 && today.getDate() < day)) age--;

    this.dobError = age < 18;
  }

  isInvalid(field: string) {
    const control = this.basicForm.get(field);
    return !!control && control.invalid && control.touched;
  }

  // ---------------------------
  // Risk popup logic
  // ---------------------------
openRiskPopup() {
  if (!this.activeRiskTab || this.activeRiskTab < 1) this.activeRiskTab = 1;
  this.showRiskPopup = true;
  this.riskError = false;
}


  closeRiskPopup() {
    this.showRiskPopup = false;
  }

  selectRisk(item: string) {
    this.selectedRiskCategory = item;
    this.riskError = false;
    this.showRiskPopup = false;
  }

  // -------------------------
  // ✅ Restore / Clear helpers (SuperTopup style)
  // -------------------------
  private isReloadNavigation(): boolean {
    try {
      const nav = performance.getEntriesByType('navigation')?.[0] as PerformanceNavigationTiming | undefined;
      return nav?.type === 'reload';
    } catch {
      return false;
    }
  }

  private clearTempEnquiry() {
    localStorage.removeItem(this.ENQUIRY_KEY);
  }

  private resetToFreshJourney() {
    this.step = 1;
    this.gender = 'Male';

    this.activeRiskTab = 0;
    this.selectedRiskCategory = null;
    this.riskError = false;
    this.showRiskPopup = false;

    this.basicForm.reset({
      firstName: '',
      lastName: '',
      dob: '',
      mobile: '',
      pincode: '',
      city: '',
      occupation: '',
      incomeRange: '',
      coverAmount: '',
    });

    this.dobError = false;
    this.dobFormatError = false;

    this.applyGenderIcons();
  }

  private restoreFromLocal(): boolean {
    const raw = localStorage.getItem(this.ENQUIRY_KEY);
    if (!raw) return false;

    try {
      const payload = JSON.parse(raw);
      const gender = payload?.gender;
      const details = payload?.details || {};

      this.gender = gender === 'Female' ? 'Female' : 'Male';
      this.applyGenderIcons();

      this.selectedRiskCategory = details.selectedRiskCategory ?? null;
      this.activeRiskTab = Number(details.activeRiskTab || 1);

      this.basicForm.patchValue(
        {
          firstName: details.firstName || '',
          lastName: details.lastName || '',
          dob: details.dob || '',
          mobile: details.mobile || '',
          pincode: details.pincode || '',
          city: details.city || '',
          occupation: details.occupation || '',
          incomeRange: details.incomeRange || '',
          coverAmount: details.coverAmount || '',
        },
        { emitEvent: false }
      );

      return true;
    } catch {
      return false;
    }
  }
}
