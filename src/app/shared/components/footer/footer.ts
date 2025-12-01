import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// ✅ Step 1: Add this type ABOVE the component
type AccordionKey = 'sme' | 'motor' | 'health' | 'term' | 'saving' | 'travel';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.html',
  styleUrls: ['./footer.scss'], // ❗ styleUrls (plural)
})
export class FooterComponent {

  // ✅ Step 2: Update accordion object with correct typing
  accordion: Record<AccordionKey, boolean> = {
    sme: false,
    motor: false,
    health: false,
    term: false,
    saving: false,
    travel: false
  };

  // ✅ Step 3: Correct toggle function with type safety
  toggle(section: AccordionKey) {
    this.accordion[section] = !this.accordion[section];
  }
}
