'use client'

import { InformationCircleIcon } from '@heroicons/react/24/solid'
import { BentoBoxV1ChainId } from '@sushiswap/bentobox'
import {
  CardDescription,
  CardHeader,
  CardTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  LinkExternal,
} from '@sushiswap/ui'
import { Button, ButtonProps } from '@sushiswap/ui/components/button'
import dynamic from 'next/dynamic'
import React, { FC } from 'react'
import { Address } from 'wagmi'

import { ApprovalState, useBentoboxApproval } from '../../hooks'

export interface ApproveBentoboxProps extends ButtonProps {
  chainId: BentoBoxV1ChainId
  id: string
  masterContract: Address
  enabled?: boolean
  tag: string
}

export const Component: FC<ApproveBentoboxProps> = ({
  id,
  chainId,
  masterContract,
  children,
  enabled = true,
  fullWidth = true,
  tag,
  size = 'xl',
  ...props
}) => {
  const [state, execute] = useBentoboxApproval({ enabled, chainId, masterContract, tag })

  if (state === ApprovalState.APPROVED || !enabled) {
    return <>{children}</>
  }

  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <Button
        loading={state === ApprovalState.LOADING || state === ApprovalState.PENDING || !execute}
        onClick={() => execute?.()}
        fullWidth={fullWidth}
        size={size}
        testId={id}
        {...props}
      >
        Approve Bentobox
        <HoverCardTrigger>
          <InformationCircleIcon width={16} height={16} />
        </HoverCardTrigger>
      </Button>
      <HoverCardContent className="!p-0 max-w-[320px]">
        <CardHeader>
          <CardTitle>Approve BentoBox</CardTitle>
          <CardDescription>
            We need your approval first to access your wallet using BentoBox; you will only have to approve this master
            contract once.{' '}
            <LinkExternal
              target="_blank"
              className="text-blue hover:underline"
              href="https://www.sushi.com/academy/articles/what-is-bentobox"
              rel="noreferrer"
            >
              Learn more
            </LinkExternal>
          </CardDescription>
        </CardHeader>
      </HoverCardContent>
    </HoverCard>
  )
}

export const ApproveBentobox = dynamic(() => Promise.resolve(Component), {
  ssr: false,
})
