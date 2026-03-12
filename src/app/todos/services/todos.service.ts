import { computed, Injectable, signal } from '@angular/core';
import { StateFilter } from '../types/state-filter';
import { Todo } from '../types/todo.interface';

@Injectable({
  providedIn: 'root'
})
export class TodosService {
  private readonly todosSignal = signal<Todo[]>([]);
  readonly stateFilterSignal = signal<StateFilter>(StateFilter.ALL);
  readonly todos = this.todosSignal.asReadonly();

  add(content: string) {
    let updateFn = (todos: Todo[]) => [...todos, { id: this.generateId(), content, isCompleted: false }];
    this.updateSignal(updateFn);
  }

  update(todo: Todo) {
    let updateFn = (todos: Todo[]) => [...todos.map(t => t.id === todo.id ? todo : t)];
    this.updateSignal(updateFn);
  }

  remove(id: string) {
    let updateFn = (todos: Todo[]) => [...todos.filter(t => t.id !== id)];
    this.updateSignal(updateFn);
  }

  private updateSignal(updateFn: (todos: Todo[]) => Todo[]) {
    this.todosSignal.update(updateFn);
  }

  private generateId() {
    return Math.random().toString(36).slice(2, 9);
  }

  setFilter(stateFilter: StateFilter) {
    this.stateFilterSignal.set(stateFilter);
  }
}
