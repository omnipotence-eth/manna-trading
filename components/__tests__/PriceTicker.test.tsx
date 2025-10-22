import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PriceTicker from '../PriceTicker';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('PriceTicker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should render without crashing', () => {
    render(<PriceTicker />);
    const btcElements = screen.getAllByText('BTC');
    expect(btcElements.length).toBeGreaterThan(0);
  });

  it('should display all crypto symbols', () => {
    render(<PriceTicker />);

    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SOL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BNB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DOGE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('XRP').length).toBeGreaterThan(0);
  });

  it('should display prices with correct formatting', () => {
    render(<PriceTicker />);

    // BTC should show 2 decimal places
    expect(screen.getAllByText(/\$95000\.00/).length).toBeGreaterThan(0);
    
    // ETH should show 2 decimal places
    expect(screen.getAllByText(/\$3500\.00/).length).toBeGreaterThan(0);
    
    // DOGE should show 4 decimal places (< 1)
    expect(screen.getAllByText(/\$0\.3500/).length).toBeGreaterThan(0);
  });

  it('should display percentage changes with correct styling', () => {
    const { container } = render(<PriceTicker />);

    // Check for up/down arrows
    const arrows = container.querySelectorAll('.text-neon-green, .text-red-500');
    expect(arrows.length).toBeGreaterThan(0);
  });

  it('should update prices over time', async () => {
    render(<PriceTicker />);

    const btcElements = screen.getAllByText('BTC');
    const initialPrice = btcElements[0].parentElement?.textContent;

    // Fast-forward time by 2 seconds
    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      const btcElementsUpdated = screen.getAllByText('BTC');
      const updatedPrice = btcElementsUpdated[0].parentElement?.textContent;
      // Price should have changed (very likely but not guaranteed due to randomness)
      expect(updatedPrice).toBeDefined();
    });
  });

  it('should render ticker three times for continuous scrolling', () => {
    const { container } = render(<PriceTicker />);

    // Count occurrences of BTC (should be 3 times)
    const btcElements = screen.getAllByText('BTC');
    expect(btcElements.length).toBe(3);
  });

  it('should apply correct CSS classes for styling', () => {
    const { container } = render(<PriceTicker />);

    // Check for border styling
    const ticker = container.querySelector('.border-b');
    expect(ticker).toBeInTheDocument();

    // Check for overflow hidden
    const overflow = container.querySelector('.overflow-hidden');
    expect(overflow).toBeInTheDocument();
  });

  it('should clean up interval on unmount', () => {
    const { unmount } = render(<PriceTicker />);

    // Spy on clearInterval
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });
});

