import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-quotes',
  imports: [CommonModule],
  templateUrl: './quotes.html',
  styleUrl: './quotes.scss',
})
export class Quotes {
  plans = [
    {
      logo: 'assets/quotes/niva.svg',
      name: 'Super Top Up Mediclaim',
      features: [
        'In-patient Treatment',
        'Organ Donor’s Medical Expenses',
        'Day Care Procedure'
      ],
      cover: '₹15 Lakhs',
      deductible: '₹3 Lakhs',
      price: '₹2,122/Year',
      tag: 'AYUSH Treatment'
    },

    {
      logo: 'assets/quotes/reliance.svg',
      name: 'Health Super Top Up',
      features: [
        'All day care treatments',
        'Upto Single private AC room',
        'AYUSH Treatment'
      ],
      cover: '₹15 Lakhs',
      deductible: '₹3 Lakhs',
      price: '₹2,912/Year',
      tag: 'Covers Maternity Benefits'
    },

    {
      logo: 'assets/quotes/icici.svg',
      name: 'Health Booster',
      features: [
        'In-patient treatment',
        'Day care procedures',
        'Donor expenses'
      ],
      cover: '₹15 Lakhs',
      deductible: '₹3 Lakhs',
      price: '₹2,833/Year',
      tag: 'Covers Maternity Benefits'
    }
  ];
}
