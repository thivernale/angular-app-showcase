import { Component } from '@angular/core';
import { FooterComponent } from './components/footer/footer.component';
import { HeaderComponent } from './components/header/header.component';
import { MainComponent } from './components/main/main.component';

@Component({
  templateUrl: './todos.component.html',
  imports: [
    HeaderComponent,
    FooterComponent,
    MainComponent
  ]
})
export class TodosComponent { }
