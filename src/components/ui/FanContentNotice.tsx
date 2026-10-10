import React from 'react';
import { useLang, useT } from '../../i18n';

export const FAN_CONTENT_POLICY_URL = 'https://company.wizards.com/en/legal/fancontentpolicy';

/**
 * Informacja wymagana przez Wizards of the Coast Fan Content Policy.
 * Oficjalna formułka zawsze po angielsku (dosłownie, tak jak w zasadach WotC);
 * w polskiej wersji interfejsu dodatkowo jej tłumaczenie.
 */
export const FanContentNotice: React.FC<{ className?: string }> = ({ className = '' }) => {
  const t = useT();
  const lang = useLang();
  const policyLink = (
    <a href={FAN_CONTENT_POLICY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-300">
      Fan Content Policy
    </a>
  );
  return (
    <div className={`space-y-1 ${className}`}>
      <p lang="en">
        Mana Screw is unofficial Fan Content permitted under the {policyLink}. Not approved/endorsed by Wizards. Portions of the materials used are
        property of Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
      {lang === 'pl' && (
        <p>
          {t('Mana Screw to nieoficjalny Fan Content, dozwolony przez Fan Content Policy, niezatwierdzony ani niepopierany przez Wizards of the Coast. Prawa autorskie do części wykorzystanych materiałów, w tym nazw, tekstów i ilustracji kart, należą do Wizards of the Coast LLC.')}
        </p>
      )}
    </div>
  );
};
