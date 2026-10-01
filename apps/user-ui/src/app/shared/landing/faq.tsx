import { ChevronDown } from 'lucide-react';
import { DELIVERY_ZONES } from '@org/models/delivery';
import { Eyebrow } from './sections';
import { Reveal } from './reveal';

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: 'What is MlimaLink?',
    answer:
      'A marketplace for the Mt Kenya region. Local shops, farmers and service providers list what they offer, shoppers order from several of them in one cart, and local riders deliver.',
  },
  {
    question: 'How does delivery work?',
    answer:
      'Once the shop confirms your order, it asks a rider in its town to deliver. You get the rider’s name, phone and vehicle as soon as they accept, and you can follow the order until it reaches you.',
  },
  {
    question: 'What is the delivery code?',
    answer:
      'Every order gets a private 4-digit code that only you can see. Give it to the rider once you have your order. The delivery can’t be marked complete without it.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Each product shows the ways the shop accepts: pay in full, pay a deposit, or pay cash on delivery. The shop tells you how to pay anything due when it confirms your order.',
  },
  {
    question: 'How do I open a shop?',
    answer:
      'Choose “Open your shop”, create a seller account, set up your shop and add your products. You can add sizes, colours, stock and discount codes, and get riders to deliver for you.',
  },
  {
    question: 'How do I become a rider?',
    answer:
      'Sign up as a rider with your phone number, choose your vehicle and the towns you cover, and switch on “Taking jobs now”. Shops can then offer you deliveries, and you keep the delivery fee.',
  },
  {
    question: 'Which towns do you cover?',
    answer: `Riders currently serve ${DELIVERY_ZONES.join(', ')}. We’re adding more Mt Kenya towns as we grow.`,
  },
];

export function Faq() {
  return (
    <section className="bg-neutral-100 py-20 sm:py-28">
      <div className="mx-auto grid w-[90%] max-w-300 gap-12 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <Eyebrow>📪 FAQ</Eyebrow>
          <h2 className="mt-4 font-poppins text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Everything you need to know about shopping, selling and delivering
            on MlimaLink.
          </p>
        </Reveal>
        <div className="space-y-3">
          {QUESTIONS.map(({ question, answer }, index) => (
            <Reveal key={question} delay={index * 60}>
              <details className="group rounded-2xl border border-neutral-200 bg-white px-5 transition open:border-brand-start/40 open:shadow-lg open:shadow-brand-start/5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-poppins font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                  {question}
                  <ChevronDown
                    size={18}
                    className="shrink-0 text-neutral-400 transition duration-300 group-open:rotate-180 group-open:text-brand-start"
                  />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-neutral-600">
                  {answer}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
