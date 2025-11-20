import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-proposal-form',
  imports: [CommonModule, FormsModule],
  templateUrl: './proposal-form.html',
  styleUrl: './proposal-form.scss',
})
export class ProposalForm {
 step = 1;  // 1 = Quote, 2 = Insured, 3 = Summary

  constructor(private route: ActivatedRoute) {
    // Load data passed from Buy Now button
    this.route.queryParams.subscribe(params => {
      this.form.productName = params['name'];
      this.form.sumInsured = params['cover'];
      this.form.price = params['price'];
    });
  }

  // Master Form Object (All Steps)
  form: any = {
    // --- Step 1: Quote ---
    productName: '',
    pincode: '411000',
    cityState: 'Pune, Maharashtra',
    zone: 'Zone 1',
    email: '',
    phone: '',
    gender: '',
    dob: '',
    sumInsured: '',
    price: '',

    // --- Step 2: Insured ---
    insured: [
      {
        relation: 'Self',
        title: '',
        fullName: '',
        dob: '',
        height: '',
        weight: '',
        abhaId: '',
        existingDisease: 'No'
      }
    ],

    // --- Step 3: Additional ---
    annualIncome: '',
    nriDiscount: 'No',
    includeSelf: 'Yes',
    bureauScore: 'No'
  };

  // ADD a new insured person (Adult/Child)
addPerson() {
  this.form.insured.push({
    relation: 'Self',
    fullName: '',
    dob: '',
    height: '',
    weight: '',
    abhaId: '',
    existingDisease: 'No'
  });
}

// REMOVE last insured person but keep minimum 1
removePerson() {
  if (this.form.insured.length > 1) {
    this.form.insured.pop();
  }
}


  // Step Navigation
  next() {
    if (this.step < 3) this.step++;
  }

  prev() {
    if (this.step > 1) this.step--;
  }

  submit() {
    console.log("FINAL SUBMISSION →", this.form);
    alert("Proposal Submitted!");
  }
}
