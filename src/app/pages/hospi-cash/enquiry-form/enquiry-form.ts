import { Component, HostListener, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

import { firstValueFrom } from 'rxjs';
import { HospiCashService } from '../../../services/hospicash.service';

type MemberKey = 'you' | 'spouse' | 'son' | 'daughter';
type Gender = 'Male' | 'Female';

interface Member {
  key: MemberKey;
  label: string;
  iconPath: string;
  selected: boolean; // spouse
  count: number;     // son/daughter
}

@Component({
  selector: 'app-hospicash-stepper',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './enquiry-form.html',
  styleUrl: './enquiry-form.scss',
})
export class HospiCashEnquiryFormComponent {
  step = 1;
  gender: Gender = 'Male';
  maxChildren = 4;

  private readonly ENQUIRY_KEY = 'hospicash_enquiry';
  private readonly RESTORE_FLAG = 'hospicash_restore_ok';
  private readonly PAGE_KEY = 'hospicash_last_page';
  private readonly PAGE_NAME = 'hospi-cash-enquiry';

  private readonly LANDING_URL = 'https://policyplanner.com/#/';
  private readonly QUOTES_ROUTE = '/hospicash/quotes';

  // icons
  maleYou = 'assets/you.svg';
  femaleYou = 'assets/spouse.svg';
  maleSpouse = 'assets/spouse.svg';
  femaleSpouse = 'assets/you.svg';

  members: Member[] = [
    { key: 'you', label: 'You', iconPath: 'assets/you.svg', selected: true, count: 1 },
    { key: 'spouse', label: 'Spouse', iconPath: 'assets/spouse.svg', selected: false, count: 0 },
    { key: 'son', label: 'Son', iconPath: 'assets/son.svg', selected: false, count: 0 },
    { key: 'daughter', label: 'Daughter', iconPath: 'assets/daughter.svg', selected: false, count: 0 },
  ];

roomRentOptions = [
  { value: 500, label: "₹500" },
  { value: 1000, label: "₹1000" },
  { value: 1500, label: "₹1500" },
  { value: 2000, label: "₹2000" },
  { value: 2500, label: "₹2500" },
  { value: 3000, label: "₹3000" },
  { value: 3500, label: "₹3500" },
  { value: 4000, label: "₹4000" },
  { value: 4500, label: "₹4500" },
  { value: 5000, label: "₹5000" },
  { value: 7500, label: "₹7500" },


];



  // ✅ Terms
  termsAcceptedSignal: WritableSignal<boolean> = signal(false);

  // ages / dropdown
  selectedAges: Record<string, string> = {};
  adultAges: number[] = [];
  childAges: (number | string)[] = [];
  openAgeDropdownId: string | null = null;

  // form
  basicForm: FormGroup;
  basicFormSubmitAttempted = false;

  // OTP Signals
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
    private api: HospiCashService,
    private location: Location,
    private route: ActivatedRoute

  ) {
    this.basicForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z ]+$/)]],
      lastName: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z ]+$/)]],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      city: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[A-Za-z ]+$/)]],
      roomRent: ['', Validators.required],
      noOfDays: ['', Validators.required],
    });
  }

ngOnInit(): void {
  history.pushState(null, '', location.href);

  for (let a = 18; a <= 100; a++) this.adultAges.push(a);
  this.childAges.push('91 Days');
  for (let a = 1; a <= 25; a++) this.childAges.push(a);

  // ✅ Detect refresh on enquiry-form ONLY -> clear everything
  const lastPage = sessionStorage.getItem(this.PAGE_KEY);
  sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

  const isReload = this.isReloadNavigation();
  const isRealEnquiryRefresh = isReload && lastPage === this.PAGE_NAME;

  if (isRealEnquiryRefresh) {
    this.clearTempEnquiry();                 // clears localStorage payload
    sessionStorage.removeItem(this.RESTORE_FLAG); // clear restore permission
    this.resetToFreshJourney();
    return;
  }

  // ✅ Restore only if user came from quotes (flag set during submit / quotes)
  const restoreAllowed = sessionStorage.getItem(this.RESTORE_FLAG) === '1';
  const hasPayload = !!localStorage.getItem(this.ENQUIRY_KEY);

  if (restoreAllowed && hasPayload) {
    const restored = this.restoreFromLocal();
    if (restored) {
      this.step = 3;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } else {
    // fresh journey
    this.applyGenderIcons();
    const you = this.members.find((m) => m.key === 'you')!;
    you.selected = true;
    this.updateSelectedAges();
  }

  // ✅ If URL has step=3 (back from quotes), keep step 3
  const qpStep = Number(this.route.snapshot.queryParamMap.get('step') || 0);
  if (qpStep === 3) {
    this.step = 3;
  }

  // reset verification if mobile changes
  this.basicForm.get('mobile')?.valueChanges.subscribe(() => {
    this.mobileVerifiedSignal.set(false);
    this.otpErrorSignal.set(null);
    this.otpDigitsSignal.set(['', '', '', '']);
    this.otpSentSignal.set(false);
    this.stopResendTimer();
    this.resendTimerSignal.set(0);
    this.termsAcceptedSignal.set(false);
  });
}

  get f() {
    return this.basicForm.controls;
  }

  /* ---------------- BACK ---------------- */
  @HostListener('window:popstate', ['$event'])
  onBrowserBack(event: PopStateEvent) {
    event.preventDefault();
    if (this.step > 1) {
      this.step--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      history.pushState(null, '', location.href);
    } else {
      window.location.href = this.LANDING_URL;
    }
  }

  goBack() {
    if (this.step > 1) {
      this.prev();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.location.href = this.LANDING_URL;
    }
  }

  /* ---------------- STEPS ---------------- */
  anyMemberSelected(): boolean {
    const spouse = this.members.find((m) => m.key === 'spouse')!;
    const son = this.members.find((m) => m.key === 'son')!;
    const daughter = this.members.find((m) => m.key === 'daughter')!;
    return spouse.selected || son.count > 0 || daughter.count > 0 || true; // you always selected
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
      return;
    }

    if (this.step === 2) {
      const missing = this.getFlatMemberList().some((id) => !this.selectedAges[id]);
      if (missing) {
        alert('Please select ages for all members.');
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

      if (!this.mobileVerifiedSignal()) {
        this.otpErrorSignal.set('Please verify your mobile number first.');
        this.openOtpModal();
        return;
      }

      if (!this.termsAcceptedSignal()) {
        alert('Please accept Terms & Conditions.');
        return;
      }

      // ✅ PHP-style flat payload
      const layout = this.buildPhpPayload();

      // localStorage (optional)
      localStorage.setItem(this.ENQUIRY_KEY, JSON.stringify(layout));
      sessionStorage.setItem(this.RESTORE_FLAG, '1');
      sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

      // Firestore same collection pattern
      try {
        await addDoc(collection(db, 'AUX_enquiry_leads'), {
          ...layout,
          lead_type: 'hospicash',
          created_at: new Date().toISOString(),
        });
        console.log('🔥 Hospicash lead saved in Firestore');
      } catch (err) {
        console.error('❌ Firebase Save Error', err);
      }

      this.router.navigate([this.QUOTES_ROUTE]);
    }
  }

  prev() {
    if (this.step > 1) this.step--;
  }

  /* ---------------- GENDER ---------------- */
  setGender(g: Gender) {
    this.gender = g;
    this.applyGenderIcons();
    this.updateSelectedAges();
  }

  applyGenderIcons() {
    const you = this.members.find((m) => m.key === 'you')!;
    const spouse = this.members.find((m) => m.key === 'spouse')!;
    if (this.gender === 'Male') {
      you.iconPath = this.maleYou;
      spouse.iconPath = this.maleSpouse;
    } else {
      you.iconPath = this.femaleYou;
      spouse.iconPath = this.femaleSpouse;
    }
  }

  /* ---------------- MEMBERS ---------------- */
  isMemberSelected(m: Member): boolean {
    if (m.key === 'you') return true;
    if (m.key === 'spouse') return m.selected;
    return m.count > 0;
  }

  toggleMember(key: MemberKey) {
    const m = this.members.find((x) => x.key === key)!;
    if (key === 'you') return;

    if (key === 'spouse') {
      m.selected = !m.selected;
      if (!m.selected) delete this.selectedAges['spouse'];
      return;
    }

    if (key === 'son' || key === 'daughter') {
      if (m.count === 0) {
        if (this.getTotalChildren() >= this.maxChildren) {
          alert('You can select up to 4 children in total.');
          return;
        }
        m.count = 1;
      } else {
        m.count = 0;
        this.clearChildAges(key);
      }
    }
  }

  getTotalChildren(): number {
    const son = this.members.find((m) => m.key === 'son')!.count;
    const daughter = this.members.find((m) => m.key === 'daughter')!.count;
    return (son || 0) + (daughter || 0);
  }

  incrementChild(key: 'son' | 'daughter') {
    if (this.getTotalChildren() >= this.maxChildren) {
      alert('You can select up to 4 children in total.');
      return;
    }
    const m = this.members.find((x) => x.key === key)!;
    m.count++;
  }

  decrementChild(key: 'son' | 'daughter') {
    const m = this.members.find((x) => x.key === key)!;
    if (m.count <= 0) return;
    m.count--;
    this.trimChildAges(key, m.count);
    if (m.count === 0) this.clearChildAges(key);
  }

  private clearChildAges(key: 'son' | 'daughter') {
    Object.keys(this.selectedAges).forEach((k) => {
      if (k.startsWith(key)) delete this.selectedAges[k];
    });
  }

  private trimChildAges(key: 'son' | 'daughter', keepCount: number) {
    Object.keys(this.selectedAges).forEach((k) => {
      if (!k.startsWith(key)) return;
      const idx = Number(k.replace(key, ''));
      if (Number.isFinite(idx) && idx > keepCount) delete this.selectedAges[k];
    });
  }

  /* ---------------- AGE LIST ---------------- */
  getFlatMemberList(): string[] {
    const list: string[] = [];
    list.push('you');

    const spouse = this.members.find((m) => m.key === 'spouse')!;
    if (spouse.selected) list.push('spouse');

    const sonCount = this.members.find((m) => m.key === 'son')!.count;
    for (let i = 1; i <= sonCount; i++) list.push(`son${i}`);

    const daughterCount = this.members.find((m) => m.key === 'daughter')!.count;
    for (let i = 1; i <= daughterCount; i++) list.push(`daughter${i}`);

    return list;
  }

  updateSelectedAges() {
    const flat = this.getFlatMemberList();
    const newMap: Record<string, string> = {};
    flat.forEach((id) => (newMap[id] = this.selectedAges[id] ?? ''));
    this.selectedAges = newMap;
  }

  getAgeTitle(id: string): string {
    if (id === 'you') return 'Self';
    if (id === 'spouse') return 'Spouse';
    if (id.startsWith('son')) return `Son ${id.replace('son', '')}'s Age:`;
    if (id.startsWith('daughter')) return `Daughter ${id.replace('daughter', '')}'s Age:`;
    return '';
  }

  getIconForId(id: string): string {
    if (id === 'you') return this.members.find((m) => m.key === 'you')!.iconPath;
    if (id === 'spouse') return this.members.find((m) => m.key === 'spouse')!.iconPath;
    if (id.startsWith('son')) return 'assets/son.svg';
    if (id.startsWith('daughter')) return 'assets/daughter.svg';
    return '';
  }

  getAgeOptionsForId(id: string): { value: string; label: string }[] {
    const isChild = id.startsWith('son') || id.startsWith('daughter');
    if (isChild) {
      const options: { value: string; label: string }[] = [{ value: '0.4', label: '91 Days' }];
      for (let a = 1; a <= 25; a++) options.push({ value: String(a), label: `${a} Years` });
      return options;
    }
    return this.adultAges.map((a) => ({ value: String(a), label: `${a} Years` }));
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

  /* ---------------- FORM HELPERS ---------------- */
  isInvalid(controlName: string): boolean {
    const ctrl = this.basicForm.get(controlName);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched || this.basicFormSubmitAttempted);
  }

  allowOnlyLetters(event: KeyboardEvent) {
    const key = event.key;
    if (['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete'].includes(key)) return;
    if (!/^[A-Za-z ]$/.test(key)) event.preventDefault();
  }

  allowOnlyDigits(event: KeyboardEvent) {
    const key = event.key;
    if (['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete'].includes(key)) return;
    if (!/^\d$/.test(key)) event.preventDefault();
  }

  onNameInput(controlName: string) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;
    const raw = (ctrl.value || '') as string;
    const sanitized = raw.replace(/[^A-Za-z ]/g, '');
    if (sanitized !== raw) ctrl.setValue(sanitized, { emitEvent: false });
  }

  onNameInputUpper(controlName: string) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;
    let raw = (ctrl.value || '') as string;
    raw = raw.replace(/[^A-Za-z ]/g, '').toUpperCase().replace(/\s{2,}/g, ' ');
    ctrl.setValue(raw, { emitEvent: false });
  }

  onNumberInput(controlName: string, maxLength: number) {
    const ctrl = this.basicForm.get(controlName);
    if (!ctrl) return;
    let raw = (ctrl.value || '') as string;
    raw = raw.replace(/\D/g, '');
    if (maxLength && raw.length > maxLength) raw = raw.slice(0, maxLength);
    ctrl.setValue(raw, { emitEvent: false });
  }

  /* ---------------- OTP LOGIC ---------------- */
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
      setTimeout(() => (document.getElementById('otp-0') as HTMLInputElement | null)?.focus(), 50);
    } catch (err: any) {
      this.otpErrorSignal.set(err?.error?.message || err?.message || 'Failed to send OTP');
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
    const resp: any = await firstValueFrom(this.api.sendOtp(mobile));
    if (resp && typeof resp.success !== 'undefined' && resp.success !== true) {
      this.otpSentSignal.set(false);
      throw new Error(resp.message || 'Failed to send OTP');
    }
    this.otpSentSignal.set(true);
    this.startResendTimer();
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
    const val = (input.value || '').replace(/\D/g, '').slice(0, 1);

    const arr = [...this.otpDigitsSignal()];
    arr[index] = val;
    this.otpDigitsSignal.set(arr);
    input.value = val;

    if (val && index < 3) (document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null)?.focus();
    if (index === 3 && this.otpDigitsSignal().join('').length === 4) this.submitOtp();
  }

  onOtpKeydown(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace') {
      if (!this.otpDigitsSignal()[index] && index > 0) {
        (document.getElementById(`otp-${index - 1}`) as HTMLInputElement | null)?.focus();
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
      if (digits.length === 4) this.submitOtp();
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
      const resp: any = await firstValueFrom(this.api.verifyOtp(mobile, otp));
      // accept different backend shapes
      const ok =
        resp?.valid === true ||
        resp?.valid === 'true' ||
        resp?.success === true ||
        resp?.status === 'success' ||
        resp?.code === 200;

      if (!ok) {
        this.otpErrorSignal.set(resp?.message || 'Invalid OTP');
        return;
      }

      this.mobileVerifiedSignal.set(true);
      this.closeOtpModal();
    } catch (err: any) {
      this.otpErrorSignal.set(err?.error?.message || err?.message || 'Invalid OTP');
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
      setTimeout(() => (document.getElementById('otp-0') as HTMLInputElement | null)?.focus(), 50);
    } catch {
      this.otpErrorSignal.set('Failed to resend OTP');
    }
  }

  closeOtpModal() {
    this.otpModalOpenSignal.set(false);
    this.stopResendTimer();
  }

  /* ---------------- PHP-STYLE PAYLOAD ---------------- */
  private buildCoverFor(): string {
    // PHP style: 1 (self) + spouse(1/0) + childrenCount + 0
    let cover = '1';
    const spouse = this.members.find((m) => m.key === 'spouse')!;
    cover += spouse.selected ? '1' : '0';
    cover += String(this.getTotalChildren());
    cover += '0';
    return cover;
  }

  private buildPhpPayload(): Record<string, any> {
    const details = this.basicForm.getRawValue();

    const spouseSelected = this.members.find((m) => m.key === 'spouse')!.selected;
    const sonCount = this.members.find((m) => m.key === 'son')!.count || 0;
    const daughterCount = this.members.find((m) => m.key === 'daughter')!.count || 0;

    const payload: Record<string, any> = {};

    payload['product_type'] = 'hospicash';
    payload['gender'] = this.gender;

    // on/off keys like PHP
    payload['self'] = 'on';
    if (spouseSelected) payload['spouse'] = 'on';
    if (sonCount > 0) payload['son'] = 'on';
    if (daughterCount > 0) payload['daughter'] = 'on';

    payload['sonCount'] = String(sonCount);
    payload['daughterCount'] = String(daughterCount);

    payload['cover_for'] = this.buildCoverFor();

    // Ages
    payload['Age'] = this.selectedAges['you'] ?? '';
    payload['SAge'] = spouseSelected ? (this.selectedAges['spouse'] ?? '') : '';

    for (let i = 1; i <= sonCount; i++) {
      payload[`son${i}Age`] = this.selectedAges[`son${i}`] ?? '';
    }
    for (let i = 1; i <= daughterCount; i++) {
      payload[`daughter${i}Age`] = this.selectedAges[`daughter${i}`] ?? '';
    }

    // Basic details keys like your backend expects
    payload['cust_fname'] = details.firstName ?? '';
    payload['cust_lname'] = details.lastName ?? '';
    payload['cust_mobile'] = details.mobile ?? '';
    payload['cust_Pincode'] = details.pincode ?? '';
    payload['cust_city'] = details.city ?? '';
    payload['room_rent'] = details.roomRent ?? '';
    payload['no_of_days'] = details.noOfDays ?? '';

// ✅ keep old key too (so existing API logic doesn't break)
    payload['cover_amount'] = details.roomRent ?? '';



    payload['termsAccepted'] = this.termsAcceptedSignal() ? '1' : '0';
    payload['__savedAt'] = new Date().toISOString();

    return payload;
  }

  /* ------------------------- */
/* ✅ Restore/Clear helpers  */
/* ------------------------- */
private isReloadNavigation(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')?.[0] as
      | PerformanceNavigationTiming
      | undefined;
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
  this.members.forEach((m) => {
    if (m.key === 'you') {
      m.selected = true;
      m.count = 1;
    } else {
      m.selected = false;
      m.count = 0;
    }
  });

  this.selectedAges = {};
  this.openAgeDropdownId = null;

  this.basicForm.reset({
    firstName: '',
    lastName: '',
    mobile: '',
    pincode: '',
    city: '',
    roomRent: '',
    noOfDays: '',
  });

  // reset otp
  this.mobileVerifiedSignal.set(false);
  this.otpErrorSignal.set(null);
  this.otpDigitsSignal.set(['', '', '', '']);
  this.otpSentSignal.set(false);
  this.stopResendTimer();
  this.resendTimerSignal.set(0);

  this.termsAcceptedSignal.set(false);

  this.applyGenderIcons();
  this.updateSelectedAges();
}

/**
 * ✅ Hospicash localStorage payload is "PHP style flat payload"
 * so restore from keys like:
 * Age, SAge, sonCount, daughterCount, son1Age..., cust_fname..., room_rent, no_of_days etc.
 */
private restoreFromLocal(): boolean {
  const raw = localStorage.getItem(this.ENQUIRY_KEY);
  if (!raw) return false;

  try {
    const ls = JSON.parse(raw);

    // gender
    this.gender = ls?.gender === 'Female' ? 'Female' : 'Male';

    const spouseSelected = ls?.spouse === 'on';
    const sonCount = Number(ls?.sonCount || 0) || 0;
    const daughterCount = Number(ls?.daughterCount || 0) || 0;

    const you = this.members.find((m) => m.key === 'you')!;
    const spouse = this.members.find((m) => m.key === 'spouse')!;
    const son = this.members.find((m) => m.key === 'son')!;
    const daughter = this.members.find((m) => m.key === 'daughter')!;

    you.selected = true;
    you.count = 1;

    spouse.selected = !!spouseSelected;
    spouse.count = spouse.selected ? 1 : 0;

    son.count = sonCount;
    son.selected = sonCount > 0;

    daughter.count = daughterCount;
    daughter.selected = daughterCount > 0;

    // ages map
    const ageMap: Record<string, string> = {};
    ageMap['you'] = (ls?.Age ?? '').toString();
    if (spouse.selected) ageMap['spouse'] = (ls?.SAge ?? '').toString();

    for (let i = 1; i <= sonCount; i++) {
      ageMap[`son${i}`] = (ls?.[`son${i}Age`] ?? '').toString();
    }
    for (let i = 1; i <= daughterCount; i++) {
      ageMap[`daughter${i}`] = (ls?.[`daughter${i}Age`] ?? '').toString();
    }

    this.selectedAges = ageMap;
    this.updateSelectedAges();

    // patch form (your form uses roomRent/noOfDays)
    this.basicForm.patchValue(
      {
        firstName: ls?.cust_fname || '',
        lastName: ls?.cust_lname || '',
        mobile: ls?.cust_mobile || '',
        pincode: ls?.cust_Pincode || '',
        city: ls?.cust_city || '',
        roomRent: ls?.room_rent || '',
        noOfDays: ls?.no_of_days || '',
      },
      { emitEvent: false }
    );

    this.applyGenderIcons();

    // ✅ same behavior as supertopup: if mobile exists, treat as verified
    this.mobileVerifiedSignal.set(!!ls?.cust_mobile);

    // termsAccepted stored as '1'/'0'
    this.termsAcceptedSignal.set(ls?.termsAccepted === '1' || ls?.termsAccepted === 1);

    return true;
  } catch {
    return false;
  }
  }

}
