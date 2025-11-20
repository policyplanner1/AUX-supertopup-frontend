import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';



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

  // base icons (male/female generic) used for swapping
  maleIcon = 'assets/supertopup/you.svg';
  femaleIcon = 'assets/supertopup/spouse.svg';

  members: Member[] = [
    // initial icons will be set in ngOnInit based on gender
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

  constructor(private fb: FormBuilder,
    private router: Router) {
    this.basicForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.maxLength(20)]],
      lastName: ['', [Validators.required, Validators.maxLength(20)]],
      mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      city: ['', Validators.required],
      // zone: [{ value: '', disabled: true }],
      coverAmount: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    // fill ages
    for (let a = 18; a <= 100; a++) this.adultAges.push(a);
    this.childAges.push('91 Days');
    for (let a = 1; a <= 25; a++) this.childAges.push(a);

    // set icons according to current gender
    this.applyGenderIcons();
    // ensure You is selected
    const you = this.members.find(m => m.key === 'you')!;
    you.selected = true;
    this.updateSelectedAges();
    // this.basicForm.get('pincode')?.valueChanges.subscribe(() => this.updateZone());
    // this.basicForm.get('city')?.valueChanges.subscribe(() => this.updateZone());
  }
  getAgeTitle(id: string): string {
    if (id === 'you') {
      return 'Self';
    }
    if (id === 'spouse') {
      return 'Spouse';
    }

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

  /* ---------- STEP NAV ---------- */
  // private updateZone(): void {
  //   const pincode: string = this.basicForm.get('pincode')?.value || '';
  //   const city: string = (this.basicForm.get('city')?.value || '').toLowerCase();

    // let zone = '';

    // 🔹 Example logic – adjust to your real business rules
  //   if (!pincode && !city) {
  //     zone = '';
  //   } else if (city.includes('mumbai') || /^4[0-9]{5}$/.test(pincode)) {
  //     zone = '1';
  //   } else if (/^5[0-9]{5}$/.test(pincode)) {
  //     zone = '2';
  //   } else {
  //     zone = '3';
  //   }

  //   this.basicForm.patchValue({ zone }, { emitEvent: false });
  // }

  getIconForId(id: string): string {
    if (id === 'you') return this.members.find(m => m.key === 'you')!.iconPath;
    if (id === 'spouse') return this.members.find(m => m.key === 'spouse')!.iconPath;

    if (id.startsWith('son')) return 'assets/son.svg';
    if (id.startsWith('daughter')) return 'assets/daughter.svg';

    return '';
  }
  getSonMember(): Member {
    return this.members.find(m => m.key === 'son')!;
  }

  getDaughterMember(): Member {
    return this.members.find(m => m.key === 'daughter')!;
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
    // You always selected, but ensure at least one effective person
    return this.members.some(m => {
      if (m.key === 'son' || m.key === 'daughter') return m.count > 0;
      return m.selected;
    });
  }

  canProceedToStep2(): boolean {
    return this.anyMemberSelected();
  }


  next() {
    if (this.step === 1) {
      if (!this.anyMemberSelected()) {
        alert('Please select at least one member.');
        return;
      }

      this.updateSelectedAges();
      this.step = 2;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (this.step === 2) {
      const missing = this.getFlatMemberList().some(id => !this.selectedAges[id]);
      if (missing) {
        alert('Please select ages for all members.');
        return;
      }
      this.step = 3;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (this.step === 3) {
      if (this.basicForm.invalid) {
        this.basicForm.markAllAsTouched();
        alert('Please fill required fields correctly.');
        return;
      }

      const payload = this.buildPayload();
      console.log('SUBMIT payload', payload);
      localStorage.setItem('supertopup_enquiry', JSON.stringify(payload));


      // ⭐ Navigate to Quotes Screen
      this.router.navigate(['/supertopup/quotes']);
    }

  }

  prev() {
    if (this.step > 1) this.step--;
  }

  /* ---------- GENDER & ICONS ---------- */
  setGender(g: 'Male' | 'Female') {
    this.gender = g;
    this.applyGenderIcons();
    // ensure "you" always selected & counts preserved
    this.updateSelectedAges();
  }

  applyGenderIcons() {
    // "You" uses male/female icon; spouse uses opposite
    const you = this.members.find(m => m.key === 'you')!;
    const spouse = this.members.find(m => m.key === 'spouse')!;
    if (this.gender === 'Male') {
      // prefer a dedicated you.svg if exists; fallback to maleIcon
      you.iconPath = this.existsAsset('assets/you.svg') ? 'assets/you.svg' : this.maleIcon;
      spouse.iconPath = this.existsAsset('assets/spouse.svg') ? 'assets/spouse.svg' : this.femaleIcon;
    } else {
      you.iconPath = this.existsAsset('assets/you.svg') ? 'assets/spouse.svg' : this.femaleIcon;
      spouse.iconPath = this.existsAsset('assets/spouse.svg') ? 'assets/you.svg' : this.maleIcon;
      // note: if you exported gender-specific you/spouse assets, put them as 'you-female.svg' etc.
    }
  }

  // quick check: the file existence check is a best-effort (works in dev by trying to create an Image)
  // It's synchronous here just to prefer custom assets if present. If not present, fallback icons are used.
  existsAsset(path: string): boolean {
    // We cannot synchronously check filesystem in browser; assume common filenames exist.
    // Keep this function simple: return true for known for your setup. If you don't use alternate names, it's safe.
    // For your case you confirmed you have 'you.svg' 'spouse.svg' so let it return true only for those names.
    return path.endsWith('you.svg') || path.endsWith('spouse.svg') || path.endsWith('son.svg') || path.endsWith('daughter.svg') || path.endsWith('male.svg') || path.endsWith('female.svg') || path.endsWith('you-female.svg') || path.endsWith('spouse-female.svg');
  }

  /* ---------- MEMBERS / COUNTERS ---------- */
  toggleMember(key: MemberKey) {
    const m = this.members.find(x => x.key === key)!;
    if (key === 'you') return; // don't toggle You
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
    const son = this.members.find(m => m.key === 'son')!.count;
    const daughter = this.members.find(m => m.key === 'daughter')!.count;
    return son + daughter;
  }

  incrementChild(key: 'son' | 'daughter') {
    const total = this.getTotalChildren();
    if (total >= this.maxChildren) return; // blocked
    const m = this.members.find(x => x.key === key)!;
    m.count++;
    m.selected = true;
    this.normalizeChildrenCounts();
    this.updateSelectedAges();
  }

  decrementChild(key: 'son' | 'daughter') {
    const m = this.members.find(x => x.key === key)!;
    if (m.count > 0) {
      m.count--;
      if (m.count === 0) m.selected = false;
      this.updateSelectedAges();
    }
  }

  normalizeChildrenCounts() {
    // ensure sum <= maxChildren; if above reduce last (daughter) first for fairness
    let son = this.members.find(m => m.key === 'son')!;
    let daughter = this.members.find(m => m.key === 'daughter')!;
    while (son.count + daughter.count > this.maxChildren) {
      if (daughter.count > 0) daughter.count--;
      else if (son.count > 0) son.count--;
    }
    // if one count becomes 0, keep selected false
    if (son.count === 0) son.selected = false;
    if (daughter.count === 0) daughter.selected = false;
  }

  // helpers to determine if increment should be disabled
  canIncrementSon(): boolean {
    return this.getTotalChildren() < this.maxChildren;
  }
  canIncrementDaughter(): boolean {
    return this.getTotalChildren() < this.maxChildren;
  }

  /* ---------- AGES / FORM ---------- */
  getFlatMemberList(): string[] {
    const result: string[] = [];
    const you = this.members.find(m => m.key === 'you')!;
    if (you.selected) result.push('you');
    const spouse = this.members.find(m => m.key === 'spouse')!;
    if (spouse.selected) result.push('spouse');
    const sons = this.members.find(m => m.key === 'son')!;
    for (let i = 0; i < sons.count; i++) result.push(`son${i + 1}`);
    const daughters = this.members.find(m => m.key === 'daughter')!;
    for (let i = 0; i < daughters.count; i++) result.push(`daughter${i + 1}`);
    return result;
  }

  updateSelectedAges() {
    const flat = this.getFlatMemberList();
    const newMap: Record<string, string> = {};
    flat.forEach(id => {
      newMap[id] = this.selectedAges[id] ?? '';
    });
    this.selectedAges = newMap;
  }

  buildPayload() {
    return {
      members: this.getFlatMemberList().map(id => ({ id, age: this.selectedAges[id] || null })),
      details: { ...this.basicForm.getRawValue(), gender: this.gender }
    };
  }

  setAge(id: string, value: string) {
    this.selectedAges[id] = value;
  }
}
