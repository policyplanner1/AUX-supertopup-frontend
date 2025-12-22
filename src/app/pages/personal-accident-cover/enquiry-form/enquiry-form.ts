import { Component, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

/* ✅ Firebase (same as SuperTopup) */
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

/* ✅ OTP API Service */
import { PAService } from '../../../services/pa.service';
import { firstValueFrom } from 'rxjs';

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

  // ✅ restore keys (same pattern)
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

  // =========================
  // ✅ OTP STATE (Signals) - SAME AS SUPERTOPUP
  // =========================
  otpModalOpenSignal: WritableSignal<boolean> = signal(false);
  otpDigitsSignal: WritableSignal<string[]> = signal(['', '', '', '']);
  otpErrorSignal: WritableSignal<string | null> = signal(null);
  otpSentSignal: WritableSignal<boolean> = signal(false);
  resendTimerSignal: WritableSignal<number> = signal(0);
  otpValueSignal = computed(() => this.otpDigitsSignal().join(''));
  mobileVerifiedSignal: WritableSignal<boolean> = signal(false);

  private resendIntervalId: any = null;
  private readonly resendCooldown = 30;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private paService: PAService
  ) {
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
    // ✅ Detect refresh on this page only -> clear everything
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

    // ✅ IMPORTANT: If mobile changes, reset verification (same as SuperTopup)
    this.basicForm.get('mobile')?.valueChanges.subscribe(() => {
      this.mobileVerifiedSignal.set(false);
      this.otpErrorSignal.set(null);
      this.otpDigitsSignal.set(['', '', '', '']);
      this.otpSentSignal.set(false);
      this.stopResendTimer();
      this.resendTimerSignal.set(0);
    });
  }

  // ---------------------------
  // ✅ Back Journey
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

      // ✅ Must be verified BEFORE moving to step 3 (same UX as you want)
      if (!this.mobileVerifiedSignal()) {
        this.otpErrorSignal.set('Please verify your mobile number first.');
        await this.openOtpModal();
        return;
      }

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

      // ✅ Safety check: still verified
      if (!this.mobileVerifiedSignal()) {
        this.otpErrorSignal.set('Please verify your mobile number first.');
        await this.openOtpModal();
        return;
      }

      // ✅ Save payload to localStorage (keep your restore logic same)
      const payload = this.buildPayload();
      localStorage.setItem(this.ENQUIRY_KEY, JSON.stringify(payload));

      // ✅ allow restore ONLY when coming back from quotes (same browser session)
      sessionStorage.setItem(this.RESTORE_FLAG, '1');

      // ✅ mark current page (used for refresh detection)
      sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

      // ✅ FIRESTORE SAVE (same style as SuperTopup)
      const details = this.basicForm.getRawValue();

      const leadDoc: any = {
        // ---- original PA field names

        // ---- alias keys
        cust_fname: details.firstName ?? '',
        cust_lname: details.lastName ?? '',
        cust_mobile: details.mobile ?? '',
        cust_Pincode: details.pincode ?? '',
        cust_city: details.city ?? '',
        cover_amount: details.coverAmount ?? '',
        occupation_of_insured: details.occupation ?? '',
        income_range: details.incomeRange ?? '',
        riskcategory: this.selectedRiskCategory ?? '',
        risk_tab: String(this.activeRiskTab || 1),

        // ---- identifiers
        lead_type: 'personal-accident',
        plan_type: 'pa',
        created_at: new Date().toISOString(),
      };

      console.log("payload to save PA Lead:", leadDoc);

      try {
        await addDoc(collection(db, 'AUX_enquiry_leads'), leadDoc);
        console.log('🔥 PA Lead Saved in Firestore Successfully');
      } catch (err) {
        console.error('❌ Firebase Save Error (PA)', err);
      }

      // ✅ go to quotes
      this.router.navigate(['/personal-accident/quotes']);
    }
  }

  private buildPayload() {
  const details = this.basicForm.getRawValue();

  return {
    step: 3,
    gender: this.gender,
    details: {
      ...details,

      // ✅ keep existing (string)
      selectedRiskCategory: this.selectedRiskCategory,

      // ✅ keep existing (tab 1/2/3)
      activeRiskTab: this.activeRiskTab,

      // ✅ ADD THIS: numeric category for APIs
      riskCategory: Number(this.activeRiskTab || 1),
    },
    mobileVerified: this.mobileVerifiedSignal(),
  };
}


  // ✅ Risk theme (same)
  get riskTheme() {
    const tab = Number(this.activeRiskTab || 1);
    if (tab === 2) {
      return {
        brand: 'text-[#006D8D]',
        bg: 'bg-[#EAF6FA]',
        ring: 'ring-[#006D8D]/15',
        pillActive: 'bg-[#006D8D] text-white',
        itemActive: 'bg-[#006D8D] text-white border-[#006D8D]',
        itemHover: 'hover:border-[#006D8D]/30 hover:bg-[#006D8D]/5',
        focusRing: 'focus:ring-[#006D8D]/20',
        chip: 'bg-[#006D8D]/10 text-[#006D8D]',
      };
    }
    if (tab === 3) {
      return {
        brand: 'text-[#006D8D]',
        bg: 'bg-[#EAF6FA]',
        ring: 'ring-[#006D8D]/15',
        pillActive: 'bg-[#006D8D] text-white',
        itemActive: 'bg-[#006D8D] text-white border-[#006D8D]',
        itemHover: 'hover:border-[#006D8D]/30 hover:bg-[#006D8D]/5',
        focusRing: 'focus:ring-[#006D8D]/20',
        chip: 'bg-[#006D8D]/10 text-[#006D8D]',
      };
    }
    return {
      brand: 'text-[#006D8D]',
      bg: 'bg-[#EAF6FA]',
      ring: 'ring-[#006D8D]/15',
      pillActive: 'bg-[#006D8D] text-white',
      itemActive: 'bg-[#006D8D] text-white border-[#006D8D]',
      itemHover: 'hover:border-[#006D8D]/30 hover:bg-[#006D8D]/5',
      focusRing: 'focus:ring-[#006D8D]/20',
      chip: 'bg-[#006D8D]/10 text-[#006D8D]',
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

  onNumberInput(controlName: string, maxLength: number) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;

    let raw = (ctrl.value || '') as string;
    raw = raw.replace(/\D/g, '');
    if (maxLength && raw.length > maxLength) raw = raw.slice(0, maxLength);

    ctrl.setValue(raw, { emitEvent: false });
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

  // =========================
  // ✅ OTP LOGIC (Backend) - SAME AS SUPERTOPUP
  // =========================
  async openOtpModal() {
    this.initOtpState();
    this.otpModalOpenSignal.set(true);

    const mobile = (this.basicForm.get('mobile')?.value || '').toString();
    if (!mobile) {
      this.otpErrorSignal.set('Mobile number missing');
      return;
    }

    try {
      await this.sendOtpToMobile(mobile);
      setTimeout(() => {
        const el = document.getElementById('otp-0') as HTMLInputElement | null;
        el?.focus();
      }, 50);
    } catch (err: any) {
      const errorMsg = err?.error?.message || err?.message || 'Failed to send OTP. Please try again.';
      this.otpErrorSignal.set(errorMsg);
    }
  }

  initOtpState() {
    this.otpDigitsSignal.set(['', '', '', '']);
    this.otpErrorSignal.set(null);
    this.otpSentSignal.set(false);
    this.stopResendTimer();
    this.resendTimerSignal.set(0);
  }

  async sendOtpToMobile(mobile: string) {
    try {
      const resp: any = await firstValueFrom(this.paService.sendOtp(mobile));
      if (resp && typeof resp.success !== 'undefined' && resp.success !== true) {
        this.otpSentSignal.set(false);
        throw new Error(resp.message || 'Failed to send OTP');
      }
      this.otpSentSignal.set(true);
      this.startResendTimer();
    } catch (err) {
      this.otpSentSignal.set(false);
      throw err;
    }
  }

  startResendTimer() {
    this.stopResendTimer();
    this.resendTimerSignal.set(this.resendCooldown);

    this.resendIntervalId = setInterval(() => {
      this.resendTimerSignal.update((v) => {
        const next = v - 1;
        if (next <= 0) {
          this.stopResendTimer();
          return 0;
        }
        return next;
      });
    }, 1000);
  }

  stopResendTimer() {
    if (this.resendIntervalId) {
      clearInterval(this.resendIntervalId);
      this.resendIntervalId = null;
    }
  }

  onOtpInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    let val = (input.value || '').replace(/\D/g, '').slice(0, 1);

    const arr = [...this.otpDigitsSignal()];
    arr[index] = val;
    this.otpDigitsSignal.set(arr);
    input.value = val;

    if (val && index < 3) {
      const next = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null;
      next?.focus();
    }

    if (index === 3 && this.otpDigitsSignal().join('').length === 4) {
      this.submitOtp();
    }
  }

  onOtpKeydown(index: number, event: KeyboardEvent) {
    const key = event.key;

    if (key === 'Backspace') {
      if (!this.otpDigitsSignal()[index] && index > 0) {
        const prev = document.getElementById(`otp-${index - 1}`) as HTMLInputElement | null;
        prev?.focus();
      } else {
        const arr = [...this.otpDigitsSignal()];
        arr[index] = '';
        this.otpDigitsSignal.set(arr);
      }
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text') || '';
    const digits = text.replace(/\D/g, '').slice(0, 4).split('');

    if (digits.length > 0) {
      const arr = [...this.otpDigitsSignal()];
      for (let i = 0; i < 4; i++) {
        arr[i] = digits[i] || '';
        const el = document.getElementById(`otp-${i}`) as HTMLInputElement | null;
        if (el) el.value = arr[i];
      }
      this.otpDigitsSignal.set(arr);
      event.preventDefault();

      if (digits.length === 4) {
        this.submitOtp();
      }
    }
  }

  async submitOtp() {
    this.otpErrorSignal.set(null);
    const otp = this.otpDigitsSignal().join('');

    if (otp.length !== 4) {
      this.otpErrorSignal.set('Enter 4-digit OTP');
      return;
    }

    const mobile = (this.basicForm.get('mobile')?.value || '').toString();

    try {
      const resp: any = await firstValueFrom(this.paService.verifyOtp(mobile, otp));
      if (!resp || resp.valid !== true) {
        const errorMsg = resp?.message || resp?.error || 'Invalid OTP. Please try again.';
        this.otpErrorSignal.set(errorMsg);
        return;
      }

      this.mobileVerifiedSignal.set(true);
      this.closeOtpModal();
    } catch (err: any) {
      const errorMsg = err?.error?.message || err?.message || 'Invalid OTP. Please try again.';
      this.otpErrorSignal.set(errorMsg);
    }
  }

  async resendOtp() {
    const mobile = (this.basicForm.get('mobile')?.value || '').toString();
    if (!mobile) {
      this.otpErrorSignal.set('Mobile number not available');
      return;
    }

    try {
      await this.sendOtpToMobile(mobile);
      this.otpErrorSignal.set(null);
      this.otpDigitsSignal.set(['', '', '', '']);

      setTimeout(() => {
        const el = document.getElementById('otp-0') as HTMLInputElement | null;
        el?.focus();
      }, 50);
    } catch (err) {
      this.otpErrorSignal.set('Failed to resend OTP');
    }
  }

  closeOtpModal() {
    this.otpModalOpenSignal.set(false);
    this.stopResendTimer();
  }

  // -------------------------
  // ✅ Restore / Clear helpers
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

    // ✅ reset otp
    this.mobileVerifiedSignal.set(false);
    this.otpErrorSignal.set(null);
    this.otpDigitsSignal.set(['', '', '', '']);
    this.otpSentSignal.set(false);
    this.stopResendTimer();
    this.resendTimerSignal.set(0);

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

      // ✅ if mobile exists, treat as verified (same as your SuperTopup restore behavior)
      this.mobileVerifiedSignal.set(!!details.mobile);

      return true;
    } catch {
      return false;
    }
  }
}
