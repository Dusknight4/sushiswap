import React, { FC, ReactNode, useState } from 'react'
import { Menu } from '@headlessui/react'
import { usePopper } from 'react-popper'
import { InformationCircleIcon } from '@heroicons/react/24/solid'
import { Placement } from '@popperjs/core'
import ReactDOM from 'react-dom'
import { useIsMounted } from '@sushiswap/hooks'
import classNames from 'classnames'

export const Explainer: FC<{ children: ReactNode; iconSize: number; placement: Placement; className?: string }> = ({
  children,
  iconSize,
  placement,
  className,
}) => {
  const isMounted = useIsMounted()
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null)
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null)
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement,
    modifiers: [{ name: 'offset', options: { offset: [0, 8] } }],
  })

  if (typeof window === 'undefined' || !isMounted) return <></>

  return (
    <Menu as="div" className="flex justify-center">
      <Menu.Button as="button" ref={setReferenceElement}>
        <InformationCircleIcon
          width={iconSize}
          height={iconSize}
          className={classNames(className, 'text-gray-400 dark:text-slate-500')}
        />
      </Menu.Button>
      {ReactDOM.createPortal(
        <Menu.Items
          ref={setPopperElement}
          style={styles.popper}
          {...attributes.popper}
          className="z-[2000] w-[240px] rounded-xl shadow-md shadow-black/20 text-xs mt-0.5"
        >
          <div className="flex flex-col gap-3 rounded-md px-4 py-3 bg-white/50 paper dark:bg-slate-800/50">
            {children}
          </div>
        </Menu.Items>,
        document.body
      )}
    </Menu>
  )
}
