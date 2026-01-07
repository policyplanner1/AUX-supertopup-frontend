import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SuperTopupService } from '../../../services/super-topup.service';
import { toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';
import { HostListener, NgZone, ChangeDetectorRef } from '@angular/core';

// Define the payload type OUTSIDE the class
type PlanPayload = {
  coverAmount: number;
  age: number;
  sage: number | null;
  c1age: number | null;
  c2age: number | null;
  c3age: number | null;
  c4age: number | null;
};

@Component({
  selector: 'app-quotes',
  standalone: true,

  imports: [CommonModule],
  templateUrl: './quotes.html',
  styleUrl: './quotes.scss',
})
export class Quotes implements OnInit {
  private readonly ENQUIRY_KEY = 'supertopup_enquiry';
  private readonly RESTORE_FLAG = 'supertopup_enquiry_restore_ok';

  private readonly PAGE_KEY = 'supertopup_last_page';

  results: any[] = [];
  age: number | null = null;
  pincode = '';
  name = '';

  deductibleList = signal<number[]>([]);
  selectedDeductible: number | null = null;

  insurerList = signal<string[]>([]);
  selectedInsurer: string | null = null;

  selectedSort: string | null = null;

  selectedCoverageAmt: number | null = null;
  basePayload: PlanPayload | null = null;

  // Flat plan list used in UI
  plans = signal<any[]>([]);
  emptySlots = signal<number[]>([]);

  // Compare + summary strip
  maxCompare = 3;
  isCompareOpen = false;
  compare: any[] = [];
  isPdfDownloading = false;

  familyCount: number | null = null;
  adultCount: number | null = null;
  childCount: number | null = null;

  constructor(
    private router: Router,
    private api: SuperTopupService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    sessionStorage.setItem(this.PAGE_KEY, 'quotes');

    this.selectedSort = 'high';
    const savedData = localStorage.getItem(this.ENQUIRY_KEY);

    // ✅ IMPORTANT: if enquiry exists, always allow restore
    if (savedData) {
      localStorage.setItem(this.RESTORE_FLAG, '1');
    }
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const payload = this.buildPayloadFromLocal(parsed);
        this.basePayload = payload;

        const enquiry = parsed?.details ?? {};
        const members = parsed?.members ?? [];

        this.age = payload.age ?? null;
        this.pincode = enquiry.pincode ?? '';
        this.name = enquiry.firstName ?? '';

        // compute family counts (for compare summary strip)
        this.computeFamilyCounts(members);

        this.fetchAllPlans(payload);
        return;
      } catch (e) {
        console.warn('Failed to parse localStorage supertopup_enquiry, falling back.', e);
      }
    }
  }

  /* -------------------- build payload from localStorage -------------------- */

  private buildPayloadFromLocal(ls: any): PlanPayload {
    const enquiry = ls?.details ?? [];
    const members = ls?.members ?? [];

    // Extract YOU (primary) age
    const you = members.find((m: any) => m.id === 'you');
    const spouse = members.find((m: any) => m.id === 'spouse');

    // Collect child ages (sons + daughters)
    const childAges: Array<number | null> = [];

    members.forEach((m: any) => {
      if (m.id?.startsWith('son') || m.id?.startsWith('daughter')) {
        childAges.push(this.numOrNull(m.age));
      }
    });

    // pad or trim to exactly 4 entries
    while (childAges.length < 4) childAges.push(null);
    if (childAges.length > 4) childAges.length = 4;

    return {
      coverAmount: this.toNum(enquiry.coverAmount, 0),

      age: this.toNum(you?.age, 0), // YOU age
      sage: this.numOrNull(spouse?.age), // Spouse age or null

      c1age: childAges[0],
      c2age: childAges[1],
      c3age: childAges[2],
      c4age: childAges[3],
    };
  }

  private computeFamilyCounts(members: any[]): void {
    if (!Array.isArray(members)) {
      this.familyCount = null;
      this.adultCount = null;
      this.childCount = null;
      return;
    }

    let adults = 0;
    let kids = 0;

    members.forEach((m: any) => {
      const id = (m?.id || '').toString();
      if (id.startsWith('son') || id.startsWith('daughter') || m?.type === 'child') {
        kids++;
      } else {
        adults++;
      }
    });

    this.adultCount = adults;
    this.childCount = kids;
    this.familyCount = adults + kids;
  }

  /* -------------------- Filters handlers -------------------- */

  onCoverageAmountChange(event: any) {
    const newValue = Number(event.target.value);

    if (!this.basePayload) return;

    this.basePayload.coverAmount = isNaN(newValue) ? 0 : newValue;

    this.fetchAllPlans(this.basePayload);
  }

  onSortChange(event: any) {
    const value = event.target.value;

    if (value === '') {
      this.selectedSort = null;
    } else {
      this.selectedSort = value; // "low" or "high"
    }

    if (this.basePayload) {
      this.fetchAllPlans(this.basePayload);
    }
  }

  onInsurerChange(event: any) {
    const value = event.target.value;

    this.selectedInsurer = value === '' ? null : value;

    if (this.basePayload) {
      this.fetchAllPlans(this.basePayload);
    }
  }

  onDeductibleChange(event: any) {
    const value = event.target.value;

    if (value === '') {
      this.selectedDeductible = null;
    } else {
      this.selectedDeductible = Number(value);
    }

    if (this.basePayload) {
      (this.basePayload as any).deductibleAmount = this.selectedDeductible ?? null;

      this.fetchAllPlans(this.basePayload);
    }
  }
  buildPlanKey(plan: any): string {
    return plan.uniqueId;
  }

  /* -------------------- Fetch + Map all plans -------------------- */

  fetchAllPlans(payload: any) {
    this.api.getHealthPlanEndpoints().subscribe({
      next: (response) => {
        const apiList = response?.data?.map((item: any) => item.api_type) || [];

        this.api.callAllPremiumApis(apiList, payload).subscribe({
          next: (resArray) => {
            // 1️⃣ Extract insurer names
            const insurerNames: string[] = [];
            resArray.forEach((res: any) => {
              if (res?.companyName) {
                insurerNames.push(res.companyName.trim());
              }
            });
            const uniqueInsurers = Array.from(new Set(insurerNames)).sort();
            this.insurerList.set(uniqueInsurers);

            // 2️⃣ Extract all deductibles
            const allDeductibles: number[] = [];
            resArray.forEach((res: any) => {
              if (res?.premiums) {
                res.premiums.forEach((pm: any) => {
                  const d = Number(pm.deductible);
                  if (!isNaN(d)) allDeductibles.push(d);
                });
              }
            });
            const uniqueSorted = Array.from(new Set(allDeductibles)).sort((a, b) => a - b);
            this.deductibleList.set(uniqueSorted);

            // 3️⃣ Filter + Map Plans
            const mappedPlans = resArray
              .filter((res: any) => res && res.planName)
              .flatMap((p: any) => {
                let premiums = p.premiums || [];

                // deductible filter
                if (this.selectedDeductible !== null) {
                  premiums = premiums.filter(
                    (pm: any) => Number(pm.deductible) === this.selectedDeductible
                  );
                }

                // insurer filter
                if (this.selectedInsurer !== null) {
                  if (p.companyName !== this.selectedInsurer) return [];
                }

                const coverAmountNum = Number(p.coverAmount) || 0;

                return premiums.map((pm: any) => {
                  const premiumNum = Number(pm.premium) || 0;
                  const dedNum = Number(pm.deductible) || 0;
                  return {
                    uniqueId: crypto.randomUUID(),
                    // UI fields
                    logo: `assets/quote/${p.logoUrl}`,
                    name: p.planName,
                    tag: p.companyName,
                    cover: `₹ ${this.formatIndianCurrency(coverAmountNum)}`,
                    deductible: `₹ ${this.formatIndianCurrency(dedNum)}`,
                    price: `₹ ${this.formatIndianCurrency(premiumNum)}`,
                    features:
                      Array.isArray(p.features) && p.features.length
                        ? p.features
                            .map((f: any) => (typeof f === 'string' ? f : f?.includes || ''))
                            .filter(Boolean)
                        : ['No Key Features Available'],
                    brochure: pm.brochureUrl || p.brochureUrl || null,
                    onePager: pm.onePagerUrl || p.onePagerUrl || null,

                    // Compare
                    planId: pm.planId || p.planId || `${p.planName}-${dedNum}-${premiumNum}`,
                    coverAmountNumber: coverAmountNum,
                    deductibleNumber: dedNum,
                    priceNumber: premiumNum,
                    insurerName: p.companyName,
                    otherDetails: p.otherDetails,

                    fullPlan: p,
                    fullPremium: pm,
                  };
                });
              });

            console.log('mappedPlans', mappedPlans);

            // 4️⃣ Sorting
            if (!this.selectedSort) {
              this.selectedSort = 'high';
            }

            if (this.selectedSort === 'low') {
              mappedPlans.sort((a: any, b: any) => a.priceNumber - b.priceNumber);
            } else if (this.selectedSort === 'high') {
              mappedPlans.sort((a: any, b: any) => b.priceNumber - a.priceNumber);
            }

            this.plans.set(mappedPlans);
          },
          error: (err) => {
            console.error('Error calling premium APIs:', err);
          },
        });
      },
      error: (err) => {
        console.error('Error fetching endpoints:', err);
      },
    });
  }

  // private buildOtherDetails(p: any, pm: any): Record<string, string> {
  //   const details: Record<string, string> = {};

  //   if (p.companyName) details['Insurer'] = p.companyName;
  //   if (p.planName) details['Plan Name'] = p.planName;
  //   if (p.coverAmount) {
  //     const num = Number(p.coverAmount) || 0;
  //     details['Cover Amount'] = '₹ ' + this.formatIndianCurrency(num);
  //   }
  //   if (pm.deductible != null) {
  //     const d = Number(pm.deductible) || 0;
  //     details['Deductible Amount'] = '₹ ' + this.formatIndianCurrency(d);
  //   }
  //   if (pm.premium != null) {
  //     const pr = Number(pm.premium) || 0;
  //     details['Monthly Premium'] = '₹ ' + this.formatIndianCurrency(pr);
  //   }
  //   if (p.roomType) details['Room Category'] = p.roomType;
  //   if (p.tenure) details['Policy Tenure'] = String(p.tenure);

  //   // if backend sends structured otherDetails JSON, merge it
  //   try {
  //     const extra =
  //       p.otherDetails ||
  //       (p.plan?.other_details
  //         ? JSON.parse(p.plan.other_details)
  //         : undefined);
  //     if (extra && typeof extra === 'object') {
  //       Object.keys(extra).forEach((k) => {
  //         if (extra[k] != null && extra[k] !== '') {
  //           details[k] = String(extra[k]);
  //         }
  //       });
  //     }
  //   } catch {
  //     // ignore parse errors
  //   }

  //   return details;
  // }

  /* -------------------- Compare logic -------------------- */
  allowAadhaarInput(event: any) {
    const allowed = /^[0-9]$/;

    // BLOCK ALL ALPHABETS, SYMBOLS IN ANDROID ALSO
    if (!allowed.test(event.key)) {
      event.preventDefault();
    }
  }

  isSelected(plan: any): boolean {
    return this.compare.some((p) => p.key === plan.uniqueId);
  }

  onCompareToggle(plan: any, event: any) {
    const checked = event.target.checked;
    const key = plan.uniqueId;

    if (checked) {
      if (this.compare.length >= this.maxCompare) {
        alert(`You can compare up to ${this.maxCompare} plans.`);
        event.target.checked = false;
        return;
      }

      if (!this.isSelected(plan)) {
        this.compare.push({
          key: plan.uniqueId,
          planId: plan.planId,
          insurerName: plan.insurerName || plan.tag,
          productName: plan.name,
          logo: plan.logo,
          coverAmount: Number(plan.coverAmountNumber || 0),
          monthlyPrice: plan.priceNumber,
          deductible: Number(plan.deductibleNumber || 0),
          otherDetails: JSON.parse(plan.otherDetails),
          sourcePlan: plan,
        });

        console.log('data', this.compare);
      }
    } else {
      this.compare = this.compare.filter((p) => p.key !== key);
    }
  }

  callNow() {
    window.location.href = 'tel:+917798612243'; // replace with your number
  }

  getDetailsKeys(): string[] {
    console.log('otherdetails', this.compare[0]?.otherDetails);
    return Object.keys(this.compare[0]?.otherDetails || {});
  }

  removeFromCompare2(plan: any) {
    this.compare = this.compare.filter((p) => p.planId !== plan.planId);

    this.updateEmptySlots();

    // If only 0 or 1 left → close comparison
    if (this.compare.length < 2) {
      this.isCompareOpen = false;

      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 150);
      return;
    }

    // Smooth UI refresh
    setTimeout(() => this.forceReflow(), 50);
  }

  clearCompare() {
    this.compare = [];
  }

  compareNow() {
    if (this.compare.length >= 2) {
      this.isCompareOpen = true;
    } else {
      alert('Select at least 2 plans to compare.');
    }
  }

  closeCompare() {
    this.isCompareOpen = false;
  }

  trackByPlanId(index: number, plan: any) {
    return plan.planId || index;
  }

  /* -------------------- Helpers -------------------- */

  // ---- helpers ----
  private toNum(v: any, d = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  private numOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

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

  formatIndianCurrency(num: number): string {
    if (num >= 10000000) {
      return (num / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
    } else if (num >= 100000) {
      return (num / 100000).toFixed(2).replace(/\.00$/, '') + ' Lakh';
    } else {
      return num.toLocaleString('en-IN');
    }
  }

  updateEmptySlots() {
    const remaining = this.maxCompare - this.compare.length;

    // Ensure min = 0, max = 3
    const count = Math.max(0, Math.min(remaining, this.maxCompare));

    this.emptySlots.set(Array(count).fill(0));
  }

  forceReflow() {
    const wrapper = document.getElementById('compareWrapper');
    if (wrapper) wrapper.style.display = 'block'; // forces reflow
  }

  // downloadBrochure(url: string) {
  //   window.open(url, '_blank');
  // }
  goBack() {
    localStorage.setItem(this.RESTORE_FLAG, '1');

    this.router.navigate(['/supertopup/enquiry-form'], {
      queryParams: { step: 3 },
      queryParamsHandling: 'merge',
    });
  }

  goToAllFeatures(plan: any) {
    const combined = {
      ...plan.fullPlan,
      premiums: [plan.fullPremium],

      totalBasePremium: Number(plan.fullPremium.premium) || 0,
      totalDiscount: Number(plan.fullPremium.discount) || 0,
      totalPayablePremium: Number(plan.fullPremium.premium) || 0,

      deductible: plan.fullPremium.deductible,
      deductibleAmount: plan.fullPremium.deductible,
      coverAmount: plan.fullPlan.coverAmount,
    };

    this.router.navigate(['supertopup/all-features'], {
      state: { selectedPlan: combined },
    });
  }

  goToProposal(plan: any) {
    this.router.navigate(['supertopup/proposal-form'], {
      state: { selectedPlan: plan },
    });
  }

  /* -------------------- PDF Download (same logic) -------------------- */

  async downloadPDF() {
    if (this.isPdfDownloading) return;

    // ✅ turn on loader (and render it)
    this.isPdfDownloading = true;
    this.cdr.detectChanges();

    const wrapper = document.getElementById('compareWrapper') as HTMLElement | null;
    if (!wrapper) {
      this.isPdfDownloading = false;
      return;
    }

    const userStrip = wrapper.querySelector('.cmp-user-strip') as HTMLElement | null;
    const cmpRootOriginal = wrapper.querySelector('.cmp-pdf-root') as HTMLElement | null;
    if (!cmpRootOriginal) return;

    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    const normalizeStyles = (root: HTMLElement) => {
      const all = root.querySelectorAll('*') as NodeListOf<HTMLElement>;
      all.forEach((el) => {
        el.style.position = 'static';
        el.style.transform = 'none';
        el.style.filter = 'none';
        el.style.zIndex = 'auto';
        el.style.maxHeight = 'none';
        el.style.height = 'auto';
        el.style.minHeight = '0';
        el.style.overflow = 'visible';
      });

      const tableWrap = root.querySelector('.cmp-table-wrapper') as HTMLElement | null;
      if (tableWrap) {
        tableWrap.style.overflow = 'visible';
        tableWrap.style.maxHeight = 'none';
        tableWrap.style.height = 'auto';
      }
    };

    const waitForImages = async (root: HTMLElement) => {
      const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalWidth > 0) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve(); // don't remove; just resolve
            })
        )
      );
    };

    // ✅ resolves correctly whether app is on / or /supertopup/ or any base-href
    const makeAbsoluteSrc = (src: string) => {
      if (!src) return src;
      if (src.startsWith('data:')) return src;

      // Already absolute
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        return src.startsWith('//') ? window.location.protocol + src : src;
      }

      // ✅ IMPORTANT: resolve relative to <base href> / current app base
      // Example: baseURI = https://policyplanner.com/supertopup/
      // "assets/quote/x.png" => https://policyplanner.com/supertopup/assets/quote/x.png
      return new URL(src, document.baseURI).toString();
    };

    // ✅ KEY FIX: inline all <img> as base64 so mobile canvas ALWAYS draws it
    const inlineAllImages = async (root: HTMLElement) => {
      const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];

      for (const img of imgs) {
        try {
          const original = img.getAttribute('src') || '';
          if (!original || original.startsWith('data:')) continue;

          const abs = makeAbsoluteSrc(original);
          img.setAttribute('crossorigin', 'anonymous');
          img.src = abs;

          const res = await fetch(abs, { cache: 'no-store' });

          if (!res.ok) continue;

          const blob = await res.blob();
          const dataUrl: string = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(blob);
          });

          if (dataUrl.startsWith('data:')) {
            img.src = dataUrl;
          }
        } catch {
          // ignore image failures; pdf will still generate
        }
      }
    };

    // ✅ Export container (same as your logic)
    const exportBox = document.createElement('div');
    exportBox.style.position = 'absolute';
    exportBox.style.left = '0';
    exportBox.style.top = '0';
    exportBox.style.background = '#ffffff';
    exportBox.style.width = 'max-content';
    exportBox.style.padding = '0';
    exportBox.style.margin = '0';

    document.body.appendChild(exportBox);

    try {
      if (userStrip) exportBox.appendChild(userStrip.cloneNode(true));

      const clone = cmpRootOriginal.cloneNode(true) as HTMLElement;
      exportBox.appendChild(clone);

      normalizeStyles(exportBox);

      await nextFrame();
      await nextFrame();

      // wait for fonts
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      // ✅ NEW: inline images before canvas (fixes mobile logo missing)
      await inlineAllImages(exportBox);

      await waitForImages(exportBox);
      await nextFrame();

      const canvas = await toCanvas(exportBox, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        cacheBust: true, // ✅ helps on mobile
      } as any);

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      const imgW = pdfW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let y = 0;

      const imgData = canvas.toDataURL('image/png');

      pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);
      heightLeft -= pdfH;

      while (heightLeft > 0) {
        y -= pdfH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);
        heightLeft -= pdfH;
      }

      pdf.save('comparison.pdf');
      await new Promise((r) => setTimeout(r, 0));
    } catch (e) {
      console.error('PDF error:', e);
      alert('PDF export failed');
    } finally {
      exportBox.remove();

      // ✅ force UI back from "Generating…" even if canvas/pdf blocks
      this.zone.run(() => {
        this.isPdfDownloading = false;
        this.cdr.detectChanges();
      });
    }
  }

  /* -------------------- Grid template for compare table -------------------- */

  getGridTemplateColumns(): string {
    const planCount = this.compare?.length || 0;
    return `300px repeat(${planCount || 1}, 1fr)`;
  }
}