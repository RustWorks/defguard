import './style.scss';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { z } from 'zod';
import { shallow } from 'zustand/shallow';

import { useI18nContext } from '../../../../i18n/i18n-react';
import { FormCheckBox } from '../../../../shared/defguard-ui/components/Form/FormCheckBox/FormCheckBox.tsx';
import { FormInput } from '../../../../shared/defguard-ui/components/Form/FormInput/FormInput';
import { FormSelect } from '../../../../shared/defguard-ui/components/Form/FormSelect/FormSelect';
import { Card } from '../../../../shared/defguard-ui/components/Layout/Card/Card';
import { MessageBox } from '../../../../shared/defguard-ui/components/Layout/MessageBox/MessageBox';
import { SelectOption } from '../../../../shared/defguard-ui/components/Layout/Select/types';
import useApi from '../../../../shared/hooks/useApi';
import { useToaster } from '../../../../shared/hooks/useToaster';
import { QueryKeys } from '../../../../shared/queries';
import { ModifyNetworkRequest } from '../../../../shared/types';
import { titleCase } from '../../../../shared/utils/titleCase';
import {
  validateIp,
  validateIpList,
  validateIpOrDomainList,
} from '../../../../shared/validators';
import { useWizardStore } from '../../hooks/useWizardStore';

type FormInputs = ModifyNetworkRequest['network'];

export const WizardNetworkConfiguration = () => {
  const [componentMount, setComponentMount] = useState(false);
  const [groupOptions, setGroupOptions] = useState<SelectOption<string>[]>([]);
  const submitRef = useRef<HTMLInputElement | null>(null);
  const {
    network: { addNetwork },
    groups: { getGroups },
  } = useApi();

  const [submitSubject, nextSubject, setWizardState] = useWizardStore(
    (state) => [state.submitSubject, state.nextStepSubject, state.setState],
    shallow,
  );

  const wizardNetworkConfiguration = useWizardStore((state) => state.manualNetworkConfig);

  const toaster = useToaster();
  const { LL } = useI18nContext();

  const { mutate: addNetworkMutation, isLoading } = useMutation(addNetwork, {
    onSuccess: () => {
      setWizardState({ loading: false });
      toaster.success(LL.wizard.configuration.successMessage());
      nextSubject.next();
    },
    onError: (err) => {
      setWizardState({ loading: false });
      toaster.error(LL.messages.error());
      console.error(err);
    },
  });

  const { isError: groupsError, isLoading: groupsLoading } = useQuery({
    queryKey: [QueryKeys.FETCH_GROUPS],
    queryFn: getGroups,
    onSuccess: (res) => {
      setGroupOptions(
        res.groups.map((g) => ({
          key: g,
          value: g,
          label: titleCase(g),
        })),
      );
    },
    onError: (err) => {
      toaster.error(LL.messages.error());
      console.error(err);
    },
    enabled: componentMount,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
  });

  const zodSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, LL.form.error.required()),
        address: z
          .string()
          .min(1, LL.form.error.required())
          .refine((value) => {
            const netmaskPresent = value.split('/').length == 2;
            if (!netmaskPresent) {
              return false;
            }
            const ipValid = validateIp(value, true);
            if (ipValid) {
              const host = value.split('.')[3].split('/')[0];
              if (host === '0') return false;
            }
            return ipValid;
          }),
        endpoint: z.string().min(1, LL.form.error.required()),
        port: z
          .number({
            required_error: LL.form.error.required(),
          })
          .max(65535, LL.form.error.portMax())
          .nonnegative(),
        allowed_ips: z
          .string()
          .optional()
          .refine((val) => {
            if (val === '' || !val) {
              return true;
            }
            return validateIpList(val, ',', true);
          }, LL.form.error.allowedIps()),
        dns: z
          .string()
          .optional()
          .refine((val) => {
            if (val === '' || !val) {
              return true;
            }
            return validateIpOrDomainList(val, ',', true);
          }, LL.form.error.allowedIps()),
        allowed_groups: z.array(z.string().min(1, LL.form.error.minimumLength())),
        mfa_enabled: z.boolean(),
        keepalive_interval: z
          .number({
            required_error: LL.form.error.required(),
          })
          .positive(),
        peer_disconnect_threshold: z
          .number({
            required_error: LL.form.error.required(),
          })
          .refine((v) => v >= 120, LL.form.error.invalid()),
      }),
    [LL.form.error],
  );

  const getDefaultValues = useMemo((): FormInputs => {
    return { ...wizardNetworkConfiguration, allowed_groups: [] };
  }, [wizardNetworkConfiguration]);

  const { handleSubmit, control } = useForm<FormInputs>({
    mode: 'all',
    defaultValues: getDefaultValues,
    resolver: zodResolver(zodSchema),
  });

  const handleValidSubmit: SubmitHandler<FormInputs> = (values) => {
    if (!isLoading) {
      setWizardState({ loading: true });
      addNetworkMutation(values);
    }
  };

  useEffect(() => {
    const sub = submitSubject.subscribe(() => {
      submitRef.current?.click();
    });
    return () => sub?.unsubscribe();
  }, [submitSubject]);

  useEffect(() => {
    setTimeout(() => setComponentMount(true), 100);
  }, []);

  return (
    <Card id="wizard-manual-network-configuration" shaded>
      <form onSubmit={handleSubmit(handleValidSubmit)}>
        <FormInput
          controller={{ control, name: 'name' }}
          label={LL.networkConfiguration.form.fields.name.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.address()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'address' }}
          label={LL.networkConfiguration.form.fields.address.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.gateway()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'endpoint' }}
          label={LL.networkConfiguration.form.fields.endpoint.label()}
        />
        <FormInput
          controller={{ control, name: 'port' }}
          label={LL.networkConfiguration.form.fields.port.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.allowedIps()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'allowed_ips' }}
          label={LL.networkConfiguration.form.fields.allowedIps.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.dns()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'dns' }}
          label={LL.networkConfiguration.form.fields.dns.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.allowedGroups()}</p>
        </MessageBox>
        <FormSelect
          controller={{ control, name: 'allowed_groups' }}
          label={LL.networkConfiguration.form.fields.allowedGroups.label()}
          loading={groupsLoading}
          disabled={groupsError || (!groupsLoading && groupOptions.length === 0)}
          options={groupOptions}
          placeholder={LL.networkConfiguration.form.fields.allowedGroups.placeholder()}
          renderSelected={(group) => ({
            key: group,
            displayValue: titleCase(group),
          })}
        />
        <FormCheckBox
          controller={{ control, name: 'mfa_enabled' }}
          label={LL.networkConfiguration.form.fields.mfa_enabled.label()}
          labelPlacement="right"
        />
        <FormInput
          controller={{ control, name: 'keepalive_interval' }}
          label={LL.networkConfiguration.form.fields.keepalive_interval.label()}
        />
        <FormInput
          controller={{ control, name: 'peer_disconnect_threshold' }}
          label={LL.networkConfiguration.form.fields.peer_disconnect_threshold.label()}
        />
        <input type="submit" className="visually-hidden" ref={submitRef} />
      </form>
    </Card>
  );
};
