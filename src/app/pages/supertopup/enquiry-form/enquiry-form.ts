import { Component, HostListener, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

import { SuperTopupService } from '../../../services/super-topup.service';
import { firstValueFrom } from 'rxjs';

type MemberKey = 'you' | 'spouse' | 'son' | 'daughter';

interface Member {
  key: MemberKey;
  label: string;
  iconPath: string;
  selected: boolean;
  count: number; // for son/daughter
}

@Component({
  selector: 'app-supertopup-stepper',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './enquiry-form.html',
  styleUrl: './enquiry-form.scss',
})
export class EnquiryForm {
  step = 1;
  gender: 'Male' | 'Female' = 'Male';
  maxChildren = 4;

  // ✅ local restore keys (ONLY for restore behavior)
  private readonly ENQUIRY_KEY = 'supertopup_enquiry';
  private readonly RESTORE_FLAG = 'supertopup_enquiry_restore_ok';
  private readonly PAGE_KEY = 'supertopup_last_page';
  private readonly PAGE_NAME = 'enquiry-form';

  private readonly LANDING_URL = 'https://policyplanner.com/#/';

  // base icons (male/female generic) used for swapping
  maleIcon = 'assets/supertopup/you.svg';
  femaleIcon = 'assets/supertopup/spouse.svg';

  members: Member[] = [
    { key: 'you', label: 'You', iconPath: 'assets/you.svg', selected: true, count: 1 },
    { key: 'spouse', label: 'spouse', iconPath: 'assets/spouse.svg', selected: false, count: 0 },
    { key: 'son', label: 'Son', iconPath: 'assets/son.svg', selected: false, count: 0 },
    { key: 'daughter', label: 'Daughter', iconPath: 'assets/daughter.svg', selected: false, count: 0 },
  ];

  // ages / form
  selectedAges: Record<string, string> = {};
  adultAges: number[] = [];
  childAges: (number | string)[] = [];

  basicForm: FormGroup;

  basicFormSubmitAttempted = false;
  openAgeDropdownId: string | null = null;

  // =========================
  // ✅ OTP STATE (Signals)
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
    private myApiService: SuperTopupService
  ) {
    this.basicForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z ]+$/)]],
      lastName: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z ]+$/)]],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      city: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[A-Za-z ]+$/)]],
      coverAmount: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    // fill ages
    if (this.adultAges.length === 0) {
      for (let a = 18; a <= 100; a++) this.adultAges.push(a);
    }
    if (this.childAges.length === 0) {
      this.childAges.push('91 Days');
      for (let a = 1; a <= 25; a++) this.childAges.push(a);
    }

    // ✅ Detect refresh on enquiry-form ONLY -> clear everything
    const lastPage = sessionStorage.getItem(this.PAGE_KEY);
    sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

    const isReload = this.isReloadNavigation();
    const isRealEnquiryRefresh = isReload && lastPage === this.PAGE_NAME;

    if (isRealEnquiryRefresh) {
      this.clearTempEnquiry(); // clears localStorage payload
      sessionStorage.removeItem(this.RESTORE_FLAG); // clear restore permission
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
      // Normal fresh start
      this.applyGenderIcons();
      const you = this.members.find((m) => m.key === 'you')!;
      you.selected = true;
      this.updateSelectedAges();
    }

    // ✅ IMPORTANT: If mobile changes, reset verification
    this.basicForm.get('mobile')?.valueChanges.subscribe(() => {
      this.mobileVerifiedSignal.set(false);
      this.otpErrorSignal.set(null);
      this.otpDigitsSignal.set(['', '', '', '']);
      this.otpSentSignal.set(false);
      this.stopResendTimer();
      this.resendTimerSignal.set(0);
    });
  }

  get f() {
    return this.basicForm.controls;
  }

  getAgeTitle(id: string): string {
    if (id === 'you') return 'Self';
    if (id === 'spouse') return 'Spouse';
    if (id.startsWith('son')) {
      const num = id.replace('son', '') || '1';
      return `Son ${num}'s Age:`;
    }
    if (id.startsWith('daughter')) {
      const num = id.replace('daughter', '') || '1';
      return `Daughter ${num}'s`;
    }
    return '';
  }

  getIconForId(id: string): string {
    if (id === 'you') return this.members.find((m) => m.key === 'you')!.iconPath;
    if (id === 'spouse') return this.members.find((m) => m.key === 'spouse')!.iconPath;
    if (id.startsWith('son')) return 'assets/son.svg';
    if (id.startsWith('daughter')) return 'assets/daughter.svg';
    return '';
  }

  getSonMember(): Member {
    return this.members.find((m) => m.key === 'son')!;
  }
  getDaughterMember(): Member {
    return this.members.find((m) => m.key === 'daughter')!;
  }
  getSonCount(): number {
    return this.getSonMember()?.count ?? 0;
  }
  getDaughterCount(): number {
    return this.getDaughterMember()?.count ?? 0;
  }
  isDaughterDecrementDisabled(): boolean {
    return this.getDaughterCount() === 0;
  }
  isSonDecrementDisabled(): boolean {
    return this.getSonCount() === 0;
  }

  anyMemberSelected(): boolean {
    return this.members.some((m) => {
      if (m.key === 'son' || m.key === 'daughter') return m.count > 0;
      return m.selected;
    });
  }

  async next() {
    if (this.step === 1) {
      if (!this.anyMemberSelected()) {
        alert('Please select at least one member.');
        return;
      }
      this.updateSelectedAges();
      this.step = 2;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } else if (this.step === 2) {
      const missing = this.getFlatMemberList().some((id) => !this.selectedAges[id]);
      if (missing) {
        alert('Please select ages for all members.');
        return;
      }
      this.step = 3;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } else if (this.step === 3) {
      this.basicFormSubmitAttempted = true;

      if (this.basicForm.invalid) {
        this.basicForm.markAllAsTouched();
        return;
      }

      // ✅ Must be verified
      if (!this.mobileVerifiedSignal()) {
        this.otpErrorSignal.set('Please verify your mobile number first.');
        this.openOtpModal();
        return;
      }

      // ✅ keep your payload as it is (for autofill)
      const payload = this.buildPayload();
      localStorage.setItem(this.ENQUIRY_KEY, JSON.stringify(payload));

      // ✅ allow restore ONLY when coming back from quotes (same browser session)
      sessionStorage.setItem(this.RESTORE_FLAG, '1');

      // ✅ mark current page (used for refresh detection)
      sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

      // ⭐ Firestore layout EXACTLY same as your old code
      const details = this.basicForm.getRawValue();
      const layout: Record<string, string> = {};

      layout['Age'] = this.selectedAges['you'] ?? '';
      if (this.members.find((m) => m.key === 'you')?.selected) layout['self'] = 'on';

      layout['SAge'] = this.selectedAges['spouse'] ?? '';
      if (this.members.find((m) => m.key === 'spouse')?.selected) layout['spouse'] = 'on';

      layout['cover_amount'] = details.coverAmount ?? '';
      layout['cust_Pincode'] = details.pincode ?? '';
      layout['cust_city'] = details.city ?? '';
      layout['cust_fname'] = details.firstName ?? '';
      layout['cust_lname'] = details.lastName ?? '';
      layout['cust_mobile'] = details.mobile ?? '';

      layout['gender'] = this.gender ?? '';

      const sCount = this.getSonCount();
      if (sCount > 0) {
        layout['son'] = 'on';
        layout['sonCount'] = String(sCount);
        for (let i = 1; i <= sCount; i++) {
          layout[`son${i}Age`] = this.selectedAges[`son${i}`] ?? '';
        }
      } else {
        layout['sonCount'] = '0';
      }

      const dCount = this.getDaughterCount();
      if (dCount > 0) {
        layout['daughter'] = 'on';
        layout['daughterCount'] = String(dCount);
        for (let i = 1; i <= dCount; i++) {
          layout[`daughter${i}Age`] = this.selectedAges[`daughter${i}`] ?? '';
        }
      } else {
        layout['daughterCount'] = '0';
      }

      try {
        await addDoc(collection(db, 'AUX_enquiry_leads'), {
          ...layout,
          lead_type: 'super-top-up',
          created_at: new Date().toISOString(),
        });
        console.log('🔥 Saved in Firestore Successfully');
      } catch (err) {
        console.error('❌ Firebase Save Error', err);
      }

      this.router.navigate(['/supertopup/quotes']);
    }
  }

  prev() {
    if (this.step > 1) this.step--;
  }

  goBack() {
    if (this.step > 1) {
      this.prev();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.location.href = this.LANDING_URL;
    }
  }

  setGender(g: 'Male' | 'Female') {
    this.gender = g;
    this.applyGenderIcons();
    this.updateSelectedAges();
  }

  applyGenderIcons() {
    const you = this.members.find((m) => m.key === 'you')!;
    const spouse = this.members.find((m) => m.key === 'spouse')!;
    if (this.gender === 'Male') {
      you.iconPath = this.existsAsset('assets/you.svg') ? 'assets/you.svg' : this.maleIcon;
      spouse.iconPath = this.existsAsset('assets/spouse.svg') ? 'assets/spouse.svg' : this.femaleIcon;
    } else {
      you.iconPath = this.existsAsset('assets/you.svg') ? 'assets/spouse.svg' : this.femaleIcon;
      spouse.iconPath = this.existsAsset('assets/spouse.svg') ? 'assets/you.svg' : this.maleIcon;
    }
  }

  existsAsset(path: string): boolean {
    return (
      path.endsWith('you.svg') ||
      path.endsWith('spouse.svg') ||
      path.endsWith('son.svg') ||
      path.endsWith('daughter.svg') ||
      path.endsWith('male.svg') ||
      path.endsWith('female.svg') ||
      path.endsWith('you-female.svg') ||
      path.endsWith('spouse-female.svg')
    );
  }

  toggleMember(key: MemberKey) {
    const m = this.members.find((x) => x.key === key)!;
    if (key === 'you') return;
    if (key === 'son' || key === 'daughter') {
      m.selected = !m.selected;
      if (m.selected && m.count === 0) m.count = 1;
      if (!m.selected) m.count = 0;
    } else {
      m.selected = !m.selected;
    }
    this.normalizeChildrenCounts();
    this.updateSelectedAges();
  }

  getTotalChildren(): number {
    const son = this.members.find((m) => m.key === 'son')!.count;
    const daughter = this.members.find((m) => m.key === 'daughter')!.count;
    return son + daughter;
  }

  incrementChild(key: 'son' | 'daughter') {
    const total = this.getTotalChildren();
    if (total >= this.maxChildren) return;
    const m = this.members.find((x) => x.key === key)!;
    m.count++;
    m.selected = true;
    this.normalizeChildrenCounts();
    this.updateSelectedAges();
  }

  decrementChild(key: 'son' | 'daughter') {
    const m = this.members.find((x) => x.key === key)!;
    if (m.count > 0) {
      m.count--;
      if (m.count === 0) m.selected = false;
      this.updateSelectedAges();
    }
  }

  normalizeChildrenCounts() {
    let son = this.members.find((m) => m.key === 'son')!;
    let daughter = this.members.find((m) => m.key === 'daughter')!;
    while (son.count + daughter.count > this.maxChildren) {
      if (daughter.count > 0) daughter.count--;
      else if (son.count > 0) son.count--;
    }
    if (son.count === 0) son.selected = false;
    if (daughter.count === 0) daughter.selected = false;
  }

  canIncrementSon(): boolean {
    return this.getTotalChildren() < this.maxChildren;
  }
  canIncrementDaughter(): boolean {
    return this.getTotalChildren() < this.maxChildren;
  }

  getFlatMemberList(): string[] {
    const result: string[] = [];
    const you = this.members.find((m) => m.key === 'you')!;
    if (you.selected) result.push('you');
    const spouse = this.members.find((m) => m.key === 'spouse')!;
    if (spouse.selected) result.push('spouse');
    const sons = this.members.find((m) => m.key === 'son')!;
    for (let i = 0; i < sons.count; i++) result.push(`son${i + 1}`);
    const daughters = this.members.find((m) => m.key === 'daughter')!;
    for (let i = 0; i < daughters.count; i++) result.push(`daughter${i + 1}`);
    return result;
  }

  updateSelectedAges() {
    const flat = this.getFlatMemberList();
    const newMap: Record<string, string> = {};
    flat.forEach((id) => {
      newMap[id] = this.selectedAges[id] ?? '';
    });
    this.selectedAges = newMap;
  }

  buildPayload() {
    return {
      members: this.getFlatMemberList().map((id) => ({
        id,
        age: this.selectedAges[id] || null,
      })),
      details: { ...this.basicForm.getRawValue(), gender: this.gender },
    };
  }

  setAge(id: string, value: string) {
    this.selectedAges[id] = value;
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
      key === 'ArrowDown' ||
      key === 'Delete'
    ) return;

    if (!/^[A-Za-z ]$/.test(key)) event.preventDefault();
  }

  allowOnlyDigits(event: KeyboardEvent) {
    const key = event.key;
    if (
      key === 'Backspace' ||
      key === 'Tab' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'Delete'
    ) return;

    if (!/^\d$/.test(key)) event.preventDefault();
  }

  onNameInput(controlName: string) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;
    const raw = (ctrl.value || '') as string;
    const sanitized = raw.replace(/[^A-Za-z ]/g, '');
    if (sanitized !== raw) ctrl.setValue(sanitized, { emitEvent: false });
  }

  onNumberInput(controlName: string, maxLength: number) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;
    let raw = (ctrl.value || '') as string;
    raw = raw.replace(/\D/g, '');
    if (maxLength && raw.length > maxLength) raw = raw.slice(0, maxLength);
    ctrl.setValue(raw, { emitEvent: false });
  }

  getAgeOptionsForId(id: string): { value: string; label: string }[] {
    const isChild = id.startsWith('son') || id.startsWith('daughter');
    const options: { value: string; label: string }[] = [];

    if (isChild) {
      options.push({ value: '0.4', label: '91 Days' });
      for (let a = 1; a <= 25; a++) options.push({ value: String(a), label: `${a} Years` });
    } else {
      for (let a = 18; a <= 100; a++) options.push({ value: String(a), label: `${a} Years` });
    }

    return options;
  }

  toggleAgeDropdown(id: string) {
    this.openAgeDropdownId = this.openAgeDropdownId === id ? null : id;
  }

  selectAge(id: string, value: string | null) {
    this.selectedAges[id] = value ?? '';
    this.openAgeDropdownId = null;
  }

  getAgeLabelForId(id: string, value: string): string {
    if (!value) return 'Select Age';
    if (value === '0.4') return '91 Days';
    return `${value} Years`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.age-dropdown')) this.openAgeDropdownId = null;
  }

  // =========================
  // ✅ OTP LOGIC (Backend)
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
      const resp: any = await firstValueFrom(this.myApiService.sendOtp(mobile));
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
      this.resendTimerSignal.update(v => {
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
      const resp: any = await firstValueFrom(this.myApiService.verifyOtp(mobile, otp));
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


onNameInputUpper(controlName: string) {
  const ctrl = this.basicForm.get(controlName);
  if (!ctrl) return;

  const raw = ((ctrl.value || '') as string);

  // keep only letters + space
  let sanitized = raw.replace(/[^A-Za-z ]/g, '');

  // convert to ALL CAPS
  sanitized = sanitized.toUpperCase();

  // optional: avoid multiple spaces
  sanitized = sanitized.replace(/\s{2,}/g, ' ');

  if (sanitized !== raw) {
    ctrl.setValue(sanitized, { emitEvent: false });
  }
}

  // -------------------------
  // ✅ Restore/Clear helpers
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

    // reset members
    this.members.forEach(m => {
      if (m.key === 'you') {
        m.selected = true;
        m.count = 1;
      } else {
        m.selected = false;
        m.count = 0;
      }
    });

    this.selectedAges = {};
    this.basicForm.reset({
      firstName: '',
      lastName: '',
      mobile: '',
      pincode: '',
      city: '',
      coverAmount: '',
    });

    // reset otp
    this.mobileVerifiedSignal.set(false);
    this.otpErrorSignal.set(null);
    this.otpDigitsSignal.set(['', '', '', '']);
    this.otpSentSignal.set(false);
    this.stopResendTimer();
    this.resendTimerSignal.set(0);

    this.applyGenderIcons();
    this.updateSelectedAges();
  }

  private restoreFromLocal(): boolean {
    const raw = localStorage.getItem(this.ENQUIRY_KEY);
    if (!raw) return false;

    try {
      const payload = JSON.parse(raw);
      const membersArr = payload?.members || [];
      const details = payload?.details || {};

      this.gender = details.gender === 'Female' ? 'Female' : 'Male';

      const ids: string[] = membersArr.map((m: any) => (m?.id || '').toString());

      const spouseSelected = ids.includes('spouse');
      const sonCount = ids.filter(id => id.startsWith('son')).length;
      const daughterCount = ids.filter(id => id.startsWith('daughter')).length;

      const you = this.members.find(m => m.key === 'you')!;
      const spouse = this.members.find(m => m.key === 'spouse')!;
      const son = this.members.find(m => m.key === 'son')!;
      const daughter = this.members.find(m => m.key === 'daughter')!;

      you.selected = true;
      you.count = 1;

      spouse.selected = spouseSelected;
      spouse.count = spouseSelected ? 1 : 0;

      son.count = sonCount;
      son.selected = sonCount > 0;

      daughter.count = daughterCount;
      daughter.selected = daughterCount > 0;

      const ageMap: Record<string, string> = {};
      membersArr.forEach((m: any) => {
        ageMap[(m?.id || '').toString()] = (m?.age ?? '')?.toString();
      });
      this.selectedAges = ageMap;
      this.updateSelectedAges();

      this.basicForm.patchValue({
        firstName: details.firstName || '',
        lastName: details.lastName || '',
        mobile: details.mobile || '',
        pincode: details.pincode || '',
        city: details.city || '',
        coverAmount: details.coverAmount || ''
      }, { emitEvent: false });

      this.applyGenderIcons();

      // ✅ if mobile exists, treat as verified (same behavior as old)
      this.mobileVerifiedSignal.set(!!details.mobile);

      return true;
    } catch {
      return false;
    }
  }
}
