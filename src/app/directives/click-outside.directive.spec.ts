import { DOCUMENT, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClickOutsideDirective } from './click-outside.directive';

describe('ClickOutsideDirective', () => {
  let directive: ClickOutsideDirective;
  let mockElementRef: ElementRef;
  let mockDocument: Document;

  beforeEach(() => {
    const mockDiv = document.createElement('div');
    mockDocument = document;
    mockElementRef = new ElementRef(mockDiv);

    TestBed.configureTestingModule({
      providers: [
        { provide: ElementRef, useValue: mockElementRef },
        { provide: DOCUMENT, useValue: mockDocument },
      ]
    });

    directive = TestBed.runInInjectionContext(() => new ClickOutsideDirective());
    directive.ngAfterViewInit();
  });


  it('should create an instance', () => {
    expect(directive).toBeTruthy();
  });

  it('should emit clickOutsideRef when click occurs outside element', () => {
    const outsideClickHandler = vi.fn();
    directive.clickOutsideRef.subscribe(outsideClickHandler);

    const outsideElement = document.createElement('div');
    mockDocument.body.appendChild(outsideElement);

    outsideElement.click();

    expect(outsideClickHandler).toHaveBeenCalledTimes(1);
  });

  it('should not emit clickOutsideRef when click occurs inside element', () => {
    const insideClickHandler = vi.fn();
    directive.clickOutsideRef.subscribe(insideClickHandler);

    mockElementRef.nativeElement.click();
    expect(insideClickHandler).not.toHaveBeenCalled();
  });
});
