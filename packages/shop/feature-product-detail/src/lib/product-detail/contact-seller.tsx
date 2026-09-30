import type { Product } from '@org/models';
import { describeChoices } from '@org/models/catalog';
import styles from './product-detail.module.css';

export interface ContactSellerProps {
  product: Product;
  /** Whatever the shopper has picked so far, e.g. { "Unit type": "2 bedrooms" }. */
  choices: Record<string, string>;
  available: boolean;
}

/** Call, WhatsApp and email links for listings such as houses, land and cars. */
export function ContactSeller({
  product,
  choices,
  available,
}: ContactSellerProps) {
  const { phone, email } = product.contact ?? {};
  const seller = product.shopName ?? 'the seller';

  if (!available) {
    return (
      <p className={styles['contact-note']}>
        This listing is no longer available.
      </p>
    );
  }

  if (!phone && !email) {
    return (
      <p className={styles['contact-note']}>
        {seller} hasn’t shared contact details yet.
      </p>
    );
  }

  const picked = describeChoices(choices);
  const message = `Hi, I'm interested in "${product.name}"${picked ? ` (${picked})` : ''} that I saw on MlimaLink. Is it still available?`;

  return (
    <div className={styles['contact']}>
      <p className={styles['contact-title']}>Interested? Contact {seller}</p>
      <div className={styles['contact-buttons']}>
        {phone && (
          <a className={styles['contact-btn']} href={`tel:${phone}`}>
            Call {phone}
          </a>
        )}
        {phone && (
          <a
            className={`${styles['contact-btn']} ${styles['whatsapp']}`}
            href={`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        )}
        {email && (
          <a
            className={`${styles['contact-btn']} ${styles['outline']}`}
            href={`mailto:${email}?subject=${encodeURIComponent(`Enquiry: ${product.name}`)}&body=${encodeURIComponent(message)}`}
          >
            Email
          </a>
        )}
      </div>
    </div>
  );
}

export default ContactSeller;
