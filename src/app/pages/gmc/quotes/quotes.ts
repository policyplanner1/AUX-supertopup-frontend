import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PAService } from '../../../services/pa.service';
import { toPng } from "html-to-image";
import jsPDF from 'jspdf';
import { toCanvas } from 'html-to-image';
import { NgZone, ChangeDetectorRef } from '@angular/core';
import { GMCService } from '../../../services/gmc.service';

// Define the payload type OUTSIDE the class
type PlanPayload = {
  coverAmount: number;
  age: number;
  noOfAdults?: number;
  noOfChildren?: number;
};

@Component({
  selector: 'app-quotes',
  standalone: true,

  imports: [CommonModule],
  templateUrl: './quotes.html',
  styleUrl: './quotes.scss',
})
export class GMCQuotesComponent implements OnInit {

  // ✅ SAME AS SUPERTOPUP (PA keys)
  private readonly ENQUIRY_KEY = 'gmc_enquiry';
  private readonly RESTORE_FLAG = 'gmc_enquiry_restore_ok';
  private readonly PAGE_KEY = 'gmc_last_page';

  results: any[] = [];
  age: number | null = null;
  pincode = '';
  name = '';

  // deductible removed — using base/addon instead

  insurerList = signal<string[]>([]);
  selectedInsurer: string | null = null;

  selectedSort: string | null = null;

  selectedCoverageAmt: number | null = null;
  basePayload: PlanPayload | null = null;

  // Flat plan list used in UI
  plans = signal<any[]>([]);

  // Compare + summary strip
  maxCompare = 3;
  isCompareOpen = false;
  isPdfDownloading = false;
  compare: any[] = [];

  familyCount: number | null = null;
  adultCount: number | null = null;
  childCount: number | null = null;

  constructor(private router: Router, private api: GMCService, private zone: NgZone,
    private cdr: ChangeDetectorRef) { }


  ngOnInit(): void {
    // ✅ remember we are on quotes
    sessionStorage.setItem(this.PAGE_KEY, 'quotes');

    // ✅ default sorting (like supertopup)
    this.selectedSort = 'low';

    const savedData = localStorage.getItem(this.ENQUIRY_KEY);

    // ✅ IMPORTANT: if enquiry exists, always allow restore (same as supertopup)
    if (savedData) {
      localStorage.setItem(this.RESTORE_FLAG, '1');
    }


    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const payload = this.buildPayloadFromLocal(parsed);
        this.basePayload = payload;
        console.log("GMC Quotes Payload:", payload);

        const enquiry = parsed?.details ?? {};

        this.age = payload.age ?? null;
        this.pincode = enquiry.pincode ?? '';
        this.name = enquiry.firstName ?? '';

        this.fetchAllPlans(payload);
        return;
      } catch (e) {
        console.warn(
          'Failed to parse localStorage supertopup_enquiry, falling back.',
          e
        );
      }
    }
  }

  /* -------------------- build payload from localStorage -------------------- */

  private buildPayloadFromLocal(ls: any): PlanPayload {

    console.log("GMC LocalStorage Data:", ls);
    const enquiry = ls?.details ?? [];
    const coverAmount = this.toNum(enquiry.coverageAmount, 0);
    const age = this.calcAgeFromDob(enquiry.dateOfBirth);
    const noOfAdults = this.toNum(enquiry.noOfAdults, 0);
    const noOfChildren = this.toNum(enquiry.noOfChildren, 0);
    return {
      coverAmount,
      age,
      noOfAdults,
      noOfChildren
    };
  }

  private computeFamilyCounts(members: any[]): void {
    if (!Array.isArray(members) || members.length === 0) {
      // ✅ PA: only self
      this.adultCount = 1;
      this.childCount = 0;
      this.familyCount = 1;
      return;
    }

    let adults = 0;
    let kids = 0;

    members.forEach((m: any) => {
      const id = (m?.id || '').toString();
      if (id.startsWith('son') || id.startsWith('daughter') || m?.type === 'child') kids++;
      else adults++;
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

    if (value === '') this.selectedSort = null;
    else this.selectedSort = value; // "low" | "high"

    if (this.basePayload) this.fetchAllPlans(this.basePayload);
  }

  onInsurerChange(event: any) {
    const value = event.target.value;

    this.selectedInsurer = value === '' ? null : value;

    if (this.basePayload) {
      this.fetchAllPlans(this.basePayload);
    }
  }

  buildPlanKey(plan: any): string {
    return plan.uniqueId;
  }


  /* -------------------- Fetch + Map all plans -------------------- */

  fetchAllPlans(payload: any) {
    this.api.getGMCEndpoints().subscribe({
      next: (response) => {
        const apiList = response?.data?.map((item: any) => item.api_type) || [];

        this.api.callAllPremiumApis(apiList, payload).subscribe({
          next: (resArray) => {
            const insurerNames: string[] = [];
            resArray.forEach((res: any) => {
              if (res?.company) insurerNames.push(res.company.trim());
            });
            this.insurerList.set(Array.from(new Set(insurerNames)).sort());

            const mappedPlans = resArray
              .filter((res: any) => res && res.plan)
              .flatMap((p: any) => {
                if (this.selectedInsurer !== null) {
                  if (p.company !== this.selectedInsurer) return [];
                }

                const coverAmountNum = Number(p.coverAmount) || 0;
                const premiumNumber =
                  Number(String(p?.premium ?? 0).replace(/,/g, '')) || 0;

                return {
                  uniqueId: crypto.randomUUID(),

                  logo: `assets/quote/${p.logoUrl}`,
                  name: p.plan,
                  company: p.company,
                  cover: `₹ ${this.formatIndianCurrency(coverAmountNum)}`,
                  premium: `₹ ${this.formatIndianCurrency(premiumNumber)}`,
                  premiumNumber: premiumNumber,
                  coverAmountNumber: coverAmountNum,
                  features: Array.isArray(p.features) && p.features.length
                    ? p.features
                      .map((f: any) => (typeof f === 'string' ? f : f?.includes || ''))
                      .filter(Boolean)
                    : ['No Key Features Available'],

                  brochure: p.brochureUrl || null,
                  onePager: p.onePagerUrl || null,

                  // Compare helpers
                  planId: p.planId || `${p.plan}`,

                  insurerName: p.company,
                  // otherDetails:
                  //   typeof p.otherDetails === 'string'
                  //     ? JSON.parse(p.otherDetails)
                  //     : (p.otherDetails || {}),


                };
              });

            console.log('🔥 MAPPED GMC Plans:', mappedPlans);

            // ✅ same default sorting behavior
            if (!this.selectedSort) this.selectedSort = 'low';

            if (this.selectedSort === 'low') {
              mappedPlans.sort(
                (a: any, b: any) => a.premiumNumber - b.premiumNumber
              );
            } else if (this.selectedSort === 'high') {
              mappedPlans.sort(
                (a: any, b: any) => b.premiumNumber - a.premiumNumber
              );
            }

            console.log('🔥 SORTED PA Plans:', mappedPlans);

            this.plans.set(mappedPlans);
          },
          error: (err) => console.error('Error calling premium APIs:', err),
        });
      },
      error: (err) => console.error('Error fetching endpoints:', err),
    });
  }



  /* -------------------- Compare logic -------------------- */
  allowAadhaarInput(event: any) {
    const allowed = /^[0-9]$/;
    if (!allowed.test(event.key)) event.preventDefault();
  }

  get emptySlots(): number[] {
    const remaining = this.maxCompare - this.compare.length;
    return remaining > 0 ? Array(remaining).fill(0) : [];
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

          // ✅ FIX: monthlyPrice was undefined earlier
          monthlyPrice: Number(plan.priceNumber || plan.baseNumber || 0),

          base: Number(plan.baseNumber || 0),
          addon: Number(plan.addonNumber || 0),

          otherDetails: plan.otherDetails,

          sourcePlan: plan,
        });
        console.log("✅ Added to compare:", plan);
      }
    } else {
      this.compare = this.compare.filter((p) => p.key !== key);
    }
  }

  callNow() {
    window.location.href = "tel:+917798612243"; // replace with your number
  }

  getDetailsKeys(): string[] {
    return Object.keys(this.compare[0]?.otherDetails || {});
  }


  removeFromCompare(plan: any) {
    this.compare = this.compare.filter((p) => p.planId !== plan.planId);
  }

  removeFromCompare2(plan: any) {
    this.removeFromCompare(plan);
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
  private parseDobToDate(dob: any): Date | null {
    if (!dob) return null;

    // supports "DD/MM/YYYY"
    if (typeof dob === 'string' && dob.includes('/')) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim());
      if (!m) return null;
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
      return d;
    }

    // supports "YYYY-MM-DD"
    if (typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
      const [y, m, d] = dob.trim().split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
      return dt;
    }

    // if it ever comes as Date already
    if (dob instanceof Date && !isNaN(dob.getTime())) return dob;

    return null;
  }

  private calcAgeFromDob(dob: any): number {
    const dobDate = this.parseDobToDate(dob);
    if (!dobDate) return 0;

    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
    return age < 0 ? 0 : age;
  }

  private toNum(v: any, d = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  private numOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }


  formatIndianCurrency(num: number): string {
    if (num >= 10000000) return (num / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
    if (num >= 100000) return (num / 100000).toFixed(2).replace(/\.00$/, '') + ' Lakh';
    return num.toLocaleString('en-IN');
  }

  // ✅ SAME as supertopup: go back to enquiry step 3
  goBack() {
    localStorage.setItem(this.RESTORE_FLAG, '1');

    this.router.navigate(['/gmc/enquiry-form'], {
      queryParams: { step: 3 },
      queryParamsHandling: 'merge',
    });
  }

  goToProposal(plan: any) {
    this.router.navigate(['personal-accident/proposal-form'], {
      state: { selectedPlan: plan },
    });
  }

  // downloadBrochure(url: string) {
  //   window.open(url, '_blank');
  // }
  goToAllFeatures(plan: any) {
    const combined = {
      ...plan.fullPlan,
      premiums: [plan.fullPremium],

      totalBasePremium: Number(plan.fullPremium.premium) || 0,
      totalDiscount: Number(plan.fullPremium.discount) || 0,
      totalPayablePremium: Number(plan.fullPremium.premium) || 0,

      base: Number(plan.fullPremium.base ?? plan.fullPlan.base ?? 0) || 0,
      addon: Number(plan.fullPremium.addon ?? plan.fullPlan.addon ?? 0) || 0,
      coverAmount: plan.fullPlan.coverAmount,
    };

    this.router.navigate(['personal-accident/all-features'], {
      state: { selectedPlan: combined }
    });
  }





  /* -------------------- PDF Download (same logic) -------------------- */

  async downloadPDF() {
    if (this.isPdfDownloading) return;

    this.isPdfDownloading = true;
    this.cdr.detectChanges();

    const wrapper = document.getElementById("compareWrapper") as HTMLElement | null;
    if (!wrapper) { this.isPdfDownloading = false; return; }

    const userStrip = wrapper.querySelector(".cmp-user-strip") as HTMLElement | null;
    const cmpRootOriginal = wrapper.querySelector(".cmp-pdf-root") as HTMLElement | null;
    if (!cmpRootOriginal) { this.isPdfDownloading = false; return; }

    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    const normalizeStyles = (root: HTMLElement) => {
      const all = root.querySelectorAll("*") as NodeListOf<HTMLElement>;
      all.forEach((el) => {
        el.style.position = "static";
        el.style.transform = "none";
        el.style.filter = "none";
        el.style.zIndex = "auto";
        el.style.maxHeight = "none";
        el.style.height = "auto";
        el.style.minHeight = "0";
        el.style.overflow = "visible";
      });

      const tableWrap = root.querySelector(".cmp-table-wrapper") as HTMLElement | null;
      if (tableWrap) {
        tableWrap.style.overflow = "visible";
        tableWrap.style.maxHeight = "none";
        tableWrap.style.height = "auto";
      }
    };

    const waitForImages = async (root: HTMLElement) => {
      const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalWidth > 0) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );
    };

    const makeAbsoluteSrc = (src: string) => {
      if (!src) return src;
      if (src.startsWith("data:")) return src;
      if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//")) {
        return src.startsWith("//") ? window.location.protocol + src : src;
      }
      return new URL(src, document.baseURI).toString();
    };

    const inlineAllImages = async (root: HTMLElement) => {
      const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];

      for (const img of imgs) {
        try {
          const original = img.getAttribute("src") || "";
          if (!original || original.startsWith("data:")) continue;

          const abs = makeAbsoluteSrc(original);
          img.setAttribute("crossorigin", "anonymous");
          img.src = abs;

          const res = await fetch(abs, { cache: "no-store" });
          if (!res.ok) continue;

          const blob = await res.blob();
          const dataUrl: string = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(blob);
          });

          if (dataUrl.startsWith("data:")) img.src = dataUrl;
        } catch {
          // ignore
        }
      }
    };

    const exportBox = document.createElement("div");
    exportBox.style.position = "absolute";
    exportBox.style.left = "0";
    exportBox.style.top = "0";
    exportBox.style.background = "#ffffff";
    exportBox.style.width = "max-content";
    exportBox.style.padding = "0";
    exportBox.style.margin = "0";
    document.body.appendChild(exportBox);

    try {
      if (userStrip) exportBox.appendChild(userStrip.cloneNode(true));

      const clone = cmpRootOriginal.cloneNode(true) as HTMLElement;
      exportBox.appendChild(clone);

      normalizeStyles(exportBox);

      await nextFrame();
      await nextFrame();

      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      await inlineAllImages(exportBox);
      await waitForImages(exportBox);
      await nextFrame();

      const canvas = await toCanvas(exportBox, {
        backgroundColor: "#ffffff",
        pixelRatio: 3,
        cacheBust: true,
      } as any);

      const pdf = new jsPDF("l", "mm", "a4");
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      const imgW = pdfW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let y = 0;

      const imgData = canvas.toDataURL("image/png");

      pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
      heightLeft -= pdfH;

      while (heightLeft > 0) {
        y -= pdfH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
        heightLeft -= pdfH;
      }

      pdf.save("pa-comparison.pdf");
      await new Promise((r) => setTimeout(r, 0));
    } catch (e) {
      console.error("PDF error:", e);
      alert("PDF export failed");
    } finally {
      exportBox.remove();

      this.zone.run(() => {
        this.isPdfDownloading = false;
        this.cdr.detectChanges();
      });
    }
  }

  getGridTemplateColumns(): string {
    return `300px repeat(${this.compare.length || 1}, 1fr)`;
  }

}
