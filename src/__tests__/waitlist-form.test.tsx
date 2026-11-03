import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WaitlistForm from '@/components/waitlist-form'

describe('WaitlistForm', () => {
  it('shows an error for an empty submission', async () => {
    render(<WaitlistForm />)
    fireEvent.click(screen.getByTestId('waitlist-submit'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/enter your email/i)
  })

  it('shows an error for an invalid email', async () => {
    render(<WaitlistForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByTestId('waitlist-submit'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/valid email/i)
  })

  it('submits and shows the demo confirmation message', async () => {
    render(<WaitlistForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'you@example.com' } })
    fireEvent.click(screen.getByTestId('waitlist-submit'))
    const message = await screen.findByTestId('waitlist-message')
    expect(message).toHaveTextContent(/thanks/i)
    expect(message).toHaveTextContent(/demo/i)
  })
})
